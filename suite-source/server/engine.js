

const normalize = (s) => s.normalize('NFKC').toLocaleLowerCase('ko');
function tokens(text) {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    value: normalize(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));
}
function excludedRanges(text, settings) {
  const ranges = [];
  if (settings.excludeQuotes) {
    for (const expression of [/“[^”]*”/g, /「[^」]*」/g, /『[^』]*』/g, /"[^"\n]*"/g]) {
      for (const m of text.matchAll(expression)) ranges.push([m.index, m.index + m[0].length]);
    }
  }
  if (settings.excludeReferences) {
    const m = /^(?:참고\s*문헌|참고\s*자료|references|bibliography)\s*[:：]?\s*$/im.exec(text);
    if (m) ranges.push([m.index, text.length]);
  }
  for (const phrase of settings.ignorePhrases || []) {
    if (!phrase.trim()) continue;
    let index = 0;
    while ((index = text.indexOf(phrase.trim(), index)) !== -1) {
      ranges.push([index, index + phrase.trim().length]);
      index += phrase.trim().length;
    }
  }
  return ranges;
}
const overlaps = (t, range) => t.start < range[1] && t.end > range[0];
const key = (ts, start, size) =>
  ts
    .slice(start, start + size)
    .map((t) => t.value)
    .join('\u0001');

export function summarize(report) {
  const active = report.matches.filter((m) => m.kind === 'exact' && m.decision !== 'excluded');
  const matchedWords = report.tokens.filter(
    (t) => !t.excluded && active.some((m) => overlaps(t, [m.start, m.end])),
  ).length;
  const totalWords = report.tokens.filter((t) => !t.excluded).length;
  return {
    score: totalWords ? Math.round((matchedWords / totalWords) * 1000) / 10 : 0,
    matchedWords,
    totalWords,
    excludedWords: report.tokens.length - totalWords,
    similarCount: report.matches.filter((m) => m.kind === 'similar').length,
  };
}

function sentences(text, offset = 0) {
  return [...text.matchAll(/[^.!?。\n]+[.!?。]?/gu)]
    .map((m) => {
      const firstLetter = m[0].search(/[\p{L}\p{N}]/u);
      return {
        text: firstLetter < 0 ? '' : m[0].slice(firstLetter).trimEnd(),
        start: offset + m.index + Math.max(0, firstLetter),
        end: offset + m.index + m[0].trimEnd().length,
      };
    })
    .filter((s) => s.text.length >= 25 && s.text.length <= 1000);
}
const lexical = (text) =>
  normalize(text.replace(/\p{Default_Ignorable_Code_Point}/gu, '')).replace(/[^\p{L}\p{N}]/gu, '');
function grams(text) {
  const s = [...lexical(text)],
    result = new Map();
  for (let i = 0; i < s.length - 2; i++) {
    const gram = s.slice(i, i + 3).join('');
    result.set(gram, (result.get(gram) || 0) + 1);
  }
  return { counts: result, size: Math.max(0, s.length - 2) };
}

function orderedSimilarity(first, second) {
  const a = [...lexical(first)],
    b = [...lexical(second)];
  let prefix = 0,
    suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - suffix - 1] === b[b.length - suffix - 1]
  )
    suffix++;
  const width = b.length - prefix - suffix;
  const row = new Uint16Array(width + 1);
  for (let i = prefix; i < a.length - suffix; i++) {
    let diagonal = 0;
    for (let j = 1; j <= width; j++) {
      const previous = row[j];
      row[j] = a[i] === b[prefix + j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return (2 * (prefix + suffix + row[width])) / (a.length + b.length);
}

// Preserve raw UTF-16 offsets while composing decomposed Hangul and compatibility characters.
// Exact token matching deliberately continues to use the original tokenizer above.
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
function mappedLexical(text, offset = 0) {
  let clean = '';
  const rawStarts = [],
    rawEnds = [];
  let rawIndex = offset;
  for (const point of text) {
    if (!/\p{Default_Ignorable_Code_Point}/u.test(point)) {
      clean += point;
      for (let i = 0; i < point.length; i++) {
        rawStarts.push(rawIndex);
        rawEnds.push(rawIndex + point.length);
      }
    }
    rawIndex += point.length;
  }
  const chars = [],
    starts = [],
    ends = [];
  for (const { segment, index } of segmenter.segment(clean)) {
    for (const point of normalize(segment)) {
      if (!/[\p{L}\p{N}]/u.test(point)) continue;
      chars.push(point);
      starts.push(rawStarts[index]);
      ends.push(rawEnds[index + segment.length - 1]);
    }
  }
  return { chars, starts, ends };
}

function includedRanges(length, exclusions) {
  const result = [];
  let start = 0;
  for (const [from, to] of [...exclusions].sort((a, b) => a[0] - b[0])) {
    if (from > start) result.push([start, from]);
    start = Math.max(start, to);
  }
  if (start < length) result.push([start, length]);
  return result;
}

// A sparse target index finds local copies even when sentence boundaries or spacing change.
// Very frequent anchors and low-information repetitions are unsuitable evidence and are skipped.
function localIndex(chunks) {
  const index = new Map();
  chunks.forEach((chunk, chunkId) => {
    for (let i = 0; i <= chunk.chars.length - 16; i += 4) {
      const anchor = chunk.chars.slice(i, i + 16).join('');
      if (new Set(anchor).size < 6) continue;
      if (!index.has(anchor)) index.set(anchor, []);
      const positions = index.get(anchor);
      if (positions && positions.length < 32) positions.push({ chunkId, i });
      else index.set(anchor, null);
    }
  });
  return index;
}

function localCandidates(source, chunks, index, emit) {
  const mapped = mappedLexical(source.text),
    chars = mapped.chars;
  const visited = new Map();
  for (let j = 0; j <= chars.length - 16; j++) {
    const positions = index.get(chars.slice(j, j + 16).join(''));
    if (!positions) continue;
    for (const { chunkId, i } of positions) {
      const chunk = chunks[chunkId],
        identity = `${chunkId}:${i - j}`;
      if ((visited.get(identity) ?? -1) >= j + 16) continue;
      let left = 0,
        right = 16;
      while (i - left > 0 && j - left > 0 && chunk.chars[i - left - 1] === chars[j - left - 1])
        left++;
      while (
        i + right < chunk.chars.length &&
        j + right < chars.length &&
        chunk.chars[i + right] === chars[j + right]
      )
        right++;
      visited.set(identity, j + right);
      if (left + right < 24) continue;
      const evidence = chunk.chars.slice(i - left, i + right).join('');
      if (grams(evidence).counts.size < 12) continue;
      emit({
        source,
        start: chunk.starts[i - left],
        end: chunk.ends[i + right - 1],
        sourceStart: mapped.starts[j - left],
        sourceEnd: mapped.ends[j + right - 1],
        similarity: 100,
      });
    }
  }
}

export function analyze(document, sourceDocuments, options = {}) {
  if (typeof document.text !== 'string' || !document.text.trim())
    throw new Error('검사할 내용이 없습니다.');
  const settings = {
    minWords: 6,
    excludeQuotes: true,
    excludeReferences: true,
    ignorePhrases: [],
    ...options,
  };
  if (!Number.isInteger(settings.minWords) || settings.minWords < 2 || settings.minWords > 20)
    throw new Error('최소 어절은 2~20 사이여야 합니다.');
  if (
    !Array.isArray(settings.ignorePhrases) ||
    settings.ignorePhrases.length > 100 ||
    settings.ignorePhrases.some((p) => typeof p !== 'string' || p.length > 500)
  )
    throw new Error('공통 문구 설정을 확인해 주세요.');
  const ranges = excludedRanges(document.text, settings);
  const target = tokens(document.text).map((t) => ({
    ...t,
    excluded: ranges.some((r) => overlaps(t, r)),
  }));
  const sources = sourceDocuments.filter((s) => s.id !== document.id && s.text?.trim());
  const matches = [];
  const min = settings.minWords;
  const targetKeys = new Map();
  for (let i = 0; i <= target.length - min; i++) {
    if (target.slice(i, i + min).some((t) => t.excluded)) continue;
    const k = key(target, i, min);
    if (!targetKeys.has(k)) targetKeys.set(k, []);
    targetKeys.get(k).push(i);
  }
  const seen = new Set();
  const addMatch = (source, start, end, sourceStart, sourceEnd, kind, similarity = 100) => {
    const id = JSON.stringify([source.id, start, end, sourceStart, kind]);
    matches.push({
      id,
      kind,
      similarity,
      start,
      end,
      text: document.text.slice(start, end),
      sourceId: source.id,
      sourceTitle: source.title,
      sourceAuthor: source.author || '',
      reference: !!source.reference,
      sourceUrl: source.url || '',
      sourceStart,
      sourceEnd,
      sourceText: source.text.slice(sourceStart, sourceEnd),
      context: source.text.slice(
        Math.max(0, sourceStart - 80),
        Math.min(source.text.length, sourceEnd + 80),
      ),
      decision: 'pending',
      note: '',
    });
  };
  for (const source of sources) {
    const ts = tokens(source.text);
    for (let j = 0; j <= ts.length - min; j++) {
      const candidates = targetKeys.get(key(ts, j, min));
      if (!candidates) continue;
      for (const i of candidates) {
        // Only extend from the beginning of each run; repeated shingles stay linear for ordinary prose.
        if (i > 0 && j > 0 && !target[i - 1].excluded && target[i - 1].value === ts[j - 1].value)
          continue;
        let length = min;
        while (
          i + length < target.length &&
          j + length < ts.length &&
          !target[i + length].excluded &&
          target[i + length].value === ts[j + length].value
        )
          length++;
        const identity = `${source.id}:${i}:${i + length}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        addMatch(
          source,
          target[i].start,
          target[i + length - 1].end,
          ts[j].start,
          ts[j + length - 1].end,
          'exact',
        );
        if (matches.length > 5000)
          throw new Error('반복 구간이 너무 많습니다. 문서를 나누거나 공통 문구를 제외해 주세요.');
      }
    }
  }
  // A separate, interpretable lexical candidate score; never presented as semantic or AI probability.
  const included = includedRanges(document.text.length, ranges);
  const targetSentences = included.flatMap(([start, end]) =>
    sentences(document.text.slice(start, end), start).map((sentence) => ({
      ...sentence,
      grams: grams(sentence.text),
    })),
  );
  const index = new Map();
  targetSentences.forEach((sentence, i) => {
    if (sentence.grams.counts.size < 12) return;
    for (const gram of sentence.grams.counts.keys()) {
      if (!index.has(gram)) index.set(gram, []);
      index.get(gram).push(i);
    }
  });
  const chunks = included.map(([start, end]) =>
    mappedLexical(document.text.slice(start, end), start),
  );
  const anchors = localIndex(chunks);
  for (const source of sources) {
    const candidates = [];
    const emit = (candidate) => {
      // Partial exact evidence must not hide an edited remainder of the same sentence.
      if (
        matches.some(
          (m) =>
            m.kind === 'exact' &&
            m.sourceId === source.id &&
            m.start <= candidate.start + 2 &&
            m.end >= candidate.end - 2,
        )
      )
        return;
      if (candidates.some((m) => m.start <= candidate.start && m.end >= candidate.end)) return;
      candidates.push(candidate);
      if (candidates.length + matches.length > 5000)
        throw new Error('반복 구간이 너무 많습니다. 문서를 나누거나 공통 문구를 제외해 주세요.');
    };
    // Process one source at a time rather than retaining a corpus-wide character index.
    const best = new Map();
    for (const sentence of sentences(source.text)) {
      const gs = grams(sentence.text),
        counts = new Map();
      if (gs.counts.size < 12) continue;
      for (const [g, count] of gs.counts) {
        for (const i of index.get(g) || []) {
          counts.set(
            i,
            (counts.get(i) || 0) + Math.min(count, targetSentences[i].grams.counts.get(g)),
          );
        }
      }
      for (const [i, overlap] of counts) {
        const targetSentence = targetSentences[i];
        let dice = (2 * overlap) / (gs.size + targetSentence.grams.size);
        if (dice >= 0.72)
          dice = Math.min(dice, orderedSimilarity(sentence.text, targetSentence.text));
        if (dice >= 0.72 && dice > (best.get(i)?.dice ?? 0)) best.set(i, { sentence, dice });
      }
    }
    for (const [i, { sentence, dice }] of best) {
      emit({
        source,
        start: targetSentences[i].start,
        end: targetSentences[i].end,
        sourceStart: sentence.start,
        sourceEnd: sentence.end,
        similarity: Math.round(dice * 100),
      });
    }
    localCandidates(source, chunks, anchors, emit);
    for (const candidate of candidates) {
      addMatch(
        source,
        candidate.start,
        candidate.end,
        candidate.sourceStart,
        candidate.sourceEnd,
        'similar',
        candidate.similarity,
      );
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const report = {
    version: 1,
    document: { ...document },
    settings,
    tokens: target,
    matches,
    sourceCount: sources.length,
    sourceCharacters: sources.reduce((n, s) => n + s.text.length, 0),
    createdAt: new Date().toISOString(),
    coverage: '등록된 문서만 비교했습니다. 인터넷 전체 검색과 AI 작성 탐지는 포함하지 않습니다.',
  };
  return { ...report, ...summarize(report) };
}
