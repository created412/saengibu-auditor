/* 감사 엔진 — 진단(audit) → 처방(buildQuestion) → 수정(applyAnswer) → 사실 가드(guard)
 * 모든 점수는 규칙으로 계산한다: 같은 세특을 넣으면 언제나 같은 점수가 나온다. */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const ko = SA.ko;
  const lex = SA.lex;

  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const round = (v) => Math.round(v);

  const ISSUE_META = {
    forbidden: { label: '기재 금지', criterion: null, grade: 'danger' },
    overflow: { label: '분량 초과', criterion: null, grade: 'danger' },
    evidence: { label: '역량의 근거 부족', criterion: 'evidence', grade: 'caution', ref: '95쪽 · 117쪽 가' },
    knowledge: { label: '지식 단순 서술', criterion: 'evidence', grade: 'caution', ref: '95쪽' },
    selfvoice: { label: '학생 소감 어투', criterion: 'evidence', grade: 'caution', ref: '19쪽 5-나' },
    listing: { label: '활동 나열', criterion: 'process', grade: 'caution', ref: '95쪽' },
    growth: { label: '성장 흐름 없음', criterion: null, grade: 'caution', ref: '95쪽 · 117쪽 가' },
    source: { label: '원자료 근거 불명', criterion: 'exag', grade: 'caution', ref: '19쪽 5-가' },
    vague: { label: '추상적 표현', criterion: 'specific', grade: 'caution', ref: '95쪽' },
    exag: { label: '과장 표현', criterion: 'exag', grade: 'caution', ref: '19쪽 5-가' },
    cliche: { label: '상투 표현', criterion: 'dup', grade: 'caution', ref: '95쪽' },
    style: { label: '명사형 종결', criterion: null, grade: 'caution', ref: '30쪽' },
    symbol: { label: '특수문자·번호', criterion: null, grade: 'caution', ref: '30쪽' },
  };

  /** 위험 = 기재 금지(바로 수정, 점수와 무관하게 입력 불가) / 주의 = 수정 권장(품질 점수에 반영) */
  const GRADE = {
    danger: { name: '위험', note: '기재 금지 · 바로 수정', severity: 'red' },
    caution: { name: '주의', note: '수정 권장', severity: 'amber' },
  };

  /* ───────────── 단어·절 분석 ───────────── */

  function words(text) {
    return String(text).split(/\s+/).filter(Boolean);
  }

  const VERBISH = /(?:함|음|임|됨|하고|하여|하며|하는|하던|해서|했|하였|되어|되고|되며|하면서|보임|보여|가지고|느끼고|알게|있음|없음|이고|이며|였음|었음|았음|하게|하기|했음|함\.)$/;

  /** 구체어: 일반 명사·용언이 아닌 2자 이상 어간 */
  function specificStems(text) {
    const out = [];
    for (const w of words(text)) {
      const clean = w.replace(/[^가-힣A-Za-z0-9·]/g, '');
      if (!clean) continue;
      if (/[0-9]/.test(clean)) { out.push(clean); continue; }
      if (VERBISH.test(clean)) continue;
      const stem = ko.coreStem(clean);
      if (!stem || stem.length < 2) continue;
      if (lex.GENERIC_WORDS.has(clean) || lex.GENERIC_WORDS.has(stem)) continue;
      if (/(?:성|적)$/.test(stem) && lex.GENERIC_WORDS.has(stem.slice(0, -1))) continue;
      out.push(stem);
    }
    return out;
  }

  function countQuotes(text) {
    return (String(text).match(/[‘“'"「『][^’”'"」』]{2,}[’”'"」』]/g) || []).length;
  }

  function countMarkers(text, list) {
    let n = 0;
    for (const m of list) if (text.includes(m)) n++;
    return n;
  }

  const CLAUSE_BOUNDARY = /(?:하는\s*등|하면서|하였으며|했으며|하였고|하며|하여|해서|하고|한\s*뒤|한\s*후|으며|으나|지만|는\s*등|고|며|,)(?=\s)/g;

  /** 문장을 절로 나눈다 (문장 내부 오프셋 보존) */
  function splitClauses(sentence) {
    const out = [];
    let last = 0;
    let m;
    CLAUSE_BOUNDARY.lastIndex = 0;
    while ((m = CLAUSE_BOUNDARY.exec(sentence))) {
      const end = m.index + m[0].length;
      const seg = sentence.slice(last, end);
      if (seg.trim().length >= 2) out.push({ text: seg.trim(), start: last + (seg.length - seg.trimStart().length), end });
      last = end;
      while (sentence[last] === ' ') last++;
      CLAUSE_BOUNDARY.lastIndex = last;
    }
    const tail = sentence.slice(last);
    if (tail.trim()) out.push({ text: tail.trim(), start: last, end: last + tail.trimEnd().length });
    return out;
  }

  function matchesEval(text) {
    for (const p of lex.EVAL_PATTERNS) {
      p.re.lastIndex = 0;
      if (p.re.test(text)) { p.re.lastIndex = 0; return true; }
    }
    return false;
  }

  function classifyClause(text) {
    if (matchesEval(text)) return '평가';
    if (lex.THINK_VERBS.test(text)) return '사고';
    if (lex.ACT_VERBS.test(text)) return '행동';
    return '서술';
  }

  /** 절의 증거 강도: 구체어 + 사고과정 표지 + 인용 − 추상 표현 */
  function evidenceStrength(text) {
    const spec = new Set(specificStems(text)).size;
    const proc = countMarkers(text, lex.PROCESS_MARKERS);
    const quotes = countQuotes(text);
    let vague = 0;
    for (const p of lex.ABSTRACT_PATTERNS) { p.re.lastIndex = 0; vague += (text.match(p.re) || []).length; }
    return spec + 2 * proc + 2 * quotes - 1.5 * vague;
  }

  function skeletonOf(text) {
    const seq = [];
    for (const s of ko.splitSentences(text)) {
      for (const c of splitClauses(s.text)) {
        let cat = '기타';
        if (/관심|흥미|호기심/.test(c.text)) cat = '관심';
        else if (/참여/.test(c.text)) cat = '참여';
        else if (matchesEval(c.text)) cat = '평가';
        else {
          for (const [name, re] of lex.SKELETON_CATS) {
            if (re && re.test(c.text)) { cat = name; break; }
          }
        }
        if (cat !== '기타' && seq[seq.length - 1] !== cat) seq.push(cat);
      }
    }
    return seq;
  }

  /* ───────────── 원자료 대조 ───────────── */

  function sourceIndex(sources) {
    const text = String(sources || '').trim();
    if (!text) return null;
    const sents = ko.splitSentences(text).map((s) => ({ ...s, stems: new Set(specificStems(s.text)) }));
    const all = new Set();
    sents.forEach((s) => s.stems.forEach((x) => all.add(x)));
    return { text, sents, all, flat: text.replace(/\s+/g, '') };
  }

  function stemInSource(stem, idx) {
    if (idx.all.has(stem)) return true;
    return stem.length >= 2 && idx.flat.includes(stem);
  }

  /** 원자료에서 문장과 가장 가까운 대목 찾기 */
  function findEvidence(sources, query, limit = 3) {
    const idx = typeof sources === 'string' || sources == null ? sourceIndex(sources) : sources;
    if (!idx) return [];
    const q = new Set(specificStems(query));
    const thinkHints = ['비교', '근거', '판단', '왜', '모순', '주장', '생각', '의문', '반론', '입장', '해석', '결론', '고쳐', '수정'];
    return idx.sents
      .map((s) => {
        let hit = 0;
        q.forEach((x) => { if (s.stems.has(x) || s.text.includes(x)) hit++; });
        const hint = thinkHints.filter((h) => s.text.includes(h)).length;
        return { text: s.text, score: hit * 2 + hint };
      })
      .filter((r) => r.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /* ───────────── 진단 ───────────── */

  function overlaps(issues, start, end) {
    return issues.some((i) => start < i.end && end > i.start);
  }

  function sentenceAt(sentences, pos) {
    return sentences.find((s) => pos >= s.start && pos < s.end) || sentences[sentences.length - 1];
  }

  /**
   * 세특 한 편 감사.
   * opts.sources   : 원자료(탐구보고서·발표기록·관찰메모) 텍스트
   * opts.dismissed : 교사가 "유지"로 판단한 이슈 서명 Set
   * opts.classCtx  : 학급 감사 문맥 { df, n, maxSim }
   */
  function audit(text, opts = {}) {
    text = String(text || '').replace(/\r\n/g, '\n');
    const dismissed = opts.dismissed || new Set();
    const verified = opts.verified || new Set();
    const dismissedIssues = [];
    const sentences = ko.splitSentences(text);
    const src = sourceIndex(opts.sources);
    const issues = [];
    let seq = 0;

    // 교사가 '유지'한 이슈는 목록에서 빠지지만 점수 감점은 남는다(검토 상태 ≠ 문장 품질).
    // '확인함'(원자료 없이 교사가 직접 확인)은 감점도 없앤다.
    const push = (type, start, end, extra) => {
      const meta = ISSUE_META[type];
      const spanText = text.slice(start, end);
      const signature = `${type}|${spanText}`;
      const issue = {
        id: `i${++seq}`, type, label: meta.label, criterion: meta.criterion, grade: meta.grade,
        gradeName: GRADE[meta.grade].name, severity: GRADE[meta.grade].severity, ref: meta.ref,
        start, end, text: spanText, signature, penalty: 0, ...extra,
      };
      // 위험(기재 금지)은 교사가 '유지'로 표시해도 숨기지 않는다 — 바꾸거나 지워야 목록에서 사라진다
      if (meta.grade !== 'danger') {
        if (verified.has(signature)) return null;
        if (dismissed.has(signature)) { dismissedIssues.push(issue); return null; }
      }
      issues.push(issue);
      return issue;
    };
    const taken = () => issues.concat(dismissedIssues);

    // 문장별 증거 단위
    sentences.forEach((s, si) => {
      s.index = si;
      s.clauses = splitClauses(s.text).map((c) => ({
        ...c, abs: s.start + c.start, type: classifyClause(c.text), strength: evidenceStrength(c.text),
      }));
      s.specific = specificStems(s.text);
    });

    // ① 위험 — 기재요령상 입력 금지. 도서명·작품명(『』《》「」) 안은 허용
    const masked = text.replace(/『[^』]*』|《[^》]*》|「[^」]*」/g, (x) => ' '.repeat(x.length));
    for (const rule of lex.DANGER_RULES) {
      const patterns = rule.terms || [[rule.re, null]];
      for (const [re, fixed] of patterns) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(masked))) {
          if (!m[0]) { re.lastIndex++; continue; }
          const s = sentenceAt(sentences, m.index);
          if (!s) continue;
          if (rule.needs && !rule.needs.test(s.text)) continue;
          if (rule.allow && rule.allow.test(m[0])) continue;
          if (rule.filter && !rule.filter(m, s.text)) continue;
          const word = rule.mode === 'replace';
          let start = m.index;
          let end = m.index + m[0].length;
          if (!word) {
            const clause = s.clauses.find((c) => m.index >= c.abs && m.index < c.abs + c.text.length) || s.clauses[0];
            start = clause.abs;
            end = clause.abs + clause.text.length;
          }
          const hit = { rule: rule.id, title: rule.title, ref: rule.ref, word: m[0] };
          const existing = issues.find((i) => i.type === 'forbidden' && start < i.end && end > i.start);
          if (existing) {
            if (!existing.hits.some((h) => h.word === m[0] && h.rule === rule.id)) existing.hits.push(hit);
            continue;
          }
          const alts = word
            ? [...new Set([...(Array.isArray(fixed) ? fixed : fixed ? [fixed] : []),
              ...(rule.replace ? [rule.replace(m[0])] : []), ...(rule.altReplacements || [])])].filter(Boolean)
            : [];
          push('forbidden', start, end, {
            rule: rule.id, title: rule.title, ref: rule.ref, why: rule.why, hits: [hit], matches: [m[0]],
            mode: word ? 'replace' : 'clause',
            replacement: alts[0] || null, replacements: alts,
          });
        }
      }
    }
    issues.forEach((i) => {
      if (i.type !== 'forbidden') return;
      i.matches = [...new Set(i.hits.map((h) => h.word))];
      i.titles = [...new Set(i.hits.map((h) => h.title))];
      i.refs = [...new Set(i.hits.map((h) => h.ref))];
    });
    const bytes = ko.neisBytes(text);
    if (bytes > lex.BYTE_LIMIT) {
      push('overflow', text.length, text.length, {
        global: true, ref: '208쪽', title: '분량 초과', bytes,
        why: `현재 ${bytes.toLocaleString()}byte(한글 약 ${Math.round(bytes / 3)}자)로 과목별 입력 한도 1,500byte(500자)를 ${(bytes - lex.BYTE_LIMIT).toLocaleString()}byte 넘어 나이스에 입력되지 않습니다. 공통과목(공통국어·공통수학·공통영어·통합사회·통합과학·한국사·과학탐구실험)은 1·2 합산 500자입니다.`,
      });
    }

    // ② 근거 없는 평가어
    for (const p of lex.EVAL_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const start = m.index + (m[0].length - m[0].trimStart().length);
        const end = m.index + m[0].trimEnd().length;
        if (overlaps(taken(), start, end)) continue;
        const s = sentenceAt(sentences, start);
        const prev = sentences[s.index - 1];
        const own = s.clauses.filter((c) => c.abs + c.text.length <= start || c.abs >= end).filter((c) => c.type !== '평가');
        let best = Math.max(0, ...own.map((c) => c.strength));
        // 사고력 평가만 바로 앞 문장의 근거를 이어받는다. '모범이 됨' 같은 태도 평가는 그 문장 안에 장면이 있어야 함
        if (prev && p.cat === 'thinking') best = Math.max(best, ...prev.clauses.filter((c) => c.type !== '평가').map((c) => c.strength * 0.8));
        if (best >= 4) continue;
        push('evidence', start, end, {
          cat: p.cat, deleteMode: p.deleteMode, penalty: p.cat === 'thinking' ? 30 : 20,
          why: p.cat === 'thinking'
            ? '어떤 학생 행동을 근거로 그렇게 판단했는지 기록에서 확인되지 않습니다.'
            : '평가·태도 표현만 있고, 그렇게 판단한 구체적인 장면이 드러나지 않습니다.',
        });
      }
    }

    // ③ 추상적 표현
    for (const p of lex.ABSTRACT_PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(text))) {
        const start = m.index;
        const end = m.index + m[0].trimEnd().length;
        if (overlaps(taken(), start, end)) continue;
        const before = text.slice(Math.max(0, start - 4), start);
        if (/[’”'"」]\s*$|라는\s*$/.test(before)) continue;
        // 같은 문장의 다른 절에 구체적인 근거·결론이 있으면 추상 표현으로 보지 않는다
        // ("…영향을 살펴보고, 각 매체의 특성을 고려한 적절한 각색이 필요하다는 의견을 제시함.")
        // (단순히 '무엇을 읽고' 같은 행동 절이 아니라, 판단·결론이 담긴 사고 절이 있을 때만)
        const vs = sentenceAt(sentences, start);
        if (vs && vs.clauses.some((c) => (c.abs + c.text.length <= start || c.abs >= end) && c.type === '사고' && c.strength >= 4)) continue;
        let noun = '';
        let verb = '';
        if (p.kind === 'vagueObject') {
          noun = lex.VAGUE_NOUNS.find((n) => m[0].startsWith(n)) || '';
          verb = m[0].slice(noun.length + 1).trim();
        }
        push('vague', start, end, {
          kind: p.kind, noun, verb, penalty: p.kind === 'vagueObject' ? 12 : 9,
          why: p.kind === 'vagueObject'
            ? `학생이 다룬 ‘${noun}’이 구체적으로 무엇인지 기록에 없습니다. 무엇을 어떤 관점에서 ${verb.replace(/[.]$/, '')}인지 드러나야 사고과정이 보입니다.`.replace(/함인지/, '한 것인지')
            : '어떤 관점·자료·방법이었는지가 드러나지 않는 막연한 표현입니다.',
        });
      }
    }

    // ④ 과장 강조어
    for (const w of lex.EXAGGERATIONS) {
      let from = 0;
      let idx;
      while ((idx = text.indexOf(w, from)) !== -1) {
        from = idx + w.length;
        if (overlaps(taken(), idx, idx + w.length)) continue;
        push('exag', idx, idx + w.length, { penalty: 12, why: '실제 결과물로 확인하기 어려운 강조 표현입니다. 사실만 남기면 기록의 신뢰도가 올라갑니다.' });
      }
    }

    // ⑤ 상투 표현 (긴 표현부터, 겹치면 생략)
    const cliches = [...lex.CLICHES].sort((a, b) => b.length - a.length);
    const clicheHits = [];
    for (const c of cliches) {
      let from = 0;
      let idx;
      while ((idx = text.indexOf(c, from)) !== -1) {
        from = idx + c.length;
        if (clicheHits.some((h) => idx < h.end && idx + c.length > h.start)) continue;
        clicheHits.push({ start: idx, end: idx + c.length, text: c });
        if (overlaps(taken(), idx, idx + c.length)) continue;
        const cat = /참여/.test(c) ? 'participation' : /관심|흥미|호기심/.test(c) ? 'interest' : /태도|모범|열정/.test(c) ? 'attitude' : 'thinking';
        const cs = sentenceAt(sentences, idx);
        if (cat === 'thinking' && cs && Math.max(0, ...cs.clauses.filter((x) => x.type !== '평가').map((x) => x.strength)) >= 4) continue;
        push('cliche', idx, idx + c.length, { cat, penalty: 6, why: '많은 세특에 반복되는 표현이라 이 학생만의 모습이 드러나지 않습니다.' });
      }
    }

    // ⑥ 원자료 대조
    if (src) {
      for (const s of sentences) {
        const claim = s.clauses.some((c) => c.type === '사고' || c.type === '평가' || c.type === '행동');
        const stems = [...new Set(s.specific)];
        const found = stems.filter((x) => stemInSource(x, src));
        s.coverage = stems.length ? found.length / stems.length : null;
        const ev = findEvidence(src, s.text, 1)[0];
        if (ev && s.coverage != null && s.coverage >= 0.5) s.sourceMatch = ev.text;
        if (claim && stems.length >= 2 && s.coverage < 0.34 && !overlaps(taken(), s.start, s.end)) {
          const missing = stems.filter((x) => !stemInSource(x, src)).slice(0, 4);
          push('source', s.start, s.end, {
            penalty: 15, missing, deleteMode: 'sentence',
            why: `제출된 학생 자료에서 ${missing.map((x) => `‘${x}’`).join('·')} 관련 내용을 확인할 수 없습니다.`,
          });
        }
      }
    }

    // ⑦ 학생 소감 어투 · 지식 단순 서술
    for (const s of sentences) {
      if (overlaps(taken(), s.start, s.end)) continue;
      if (lex.SELF_VOICE.test(s.text)) {
        push('selfvoice', s.start, s.end, { penalty: 20, why: '학생이 쓴 소감·다짐을 옮긴 듯한 문장입니다. 세특은 교사가 직접 관찰·평가한 내용을 교사의 시점으로 씁니다.' });
        continue;
      }
      const studentAct = s.clauses.some((c) => c.type === '행동' || c.type === '사고');
      const knowledgeOnly = !studentAct && lex.KNOWLEDGE_PREDICATES.test(s.text) && s.text.length >= 12;
      const learnOnly = lex.LEARN_ONLY.test(s.text) && !s.clauses.some((c) => (c.type === '행동' || c.type === '사고') && !lex.LEARN_ONLY.test(c.text));
      if (knowledgeOnly || learnOnly) {
        push('knowledge', s.start, s.end, { penalty: 15, why: '교과 내용(성취기준에 이미 있는 지식)을 설명할 뿐, 학생이 무엇을 해서 어느 수준에 도달했는지가 없습니다.' });
      }
    }

    // ⑧ 문체 (명사형 종결) · 특수문자
    for (const s of sentences) {
      const lastWord = words(s.text).pop() || '';
      const w = lastWord.replace(/[.!?]+$/, '');
      if (!ko.isNominalEnding(w) || /(?:었|았|였|했)음$/.test(w) === false && /다$/.test(w)) {
        if (overlaps(taken(), s.start, s.end)) continue;
        push('style', s.start, s.end, { why: '서술형 문장은 명사형 어미(~함, ~임)로 끝냅니다.' });
      }
    }
    lex.SYMBOL.lastIndex = 0;
    let sm;
    while ((sm = lex.SYMBOL.exec(text))) {
      const lead = sm[0].length - sm[0].trimStart().length;
      const st = sm.index + lead;
      const en = sm.index + sm[0].trimEnd().length;
      if (en <= st || overlaps(taken(), st, en)) continue;
      push('symbol', st, en, { why: '서술형 항목에는 특수문자와 문단 구분 기호(번호) 입력을 지양합니다.' });
    }

    // ⑨ 글 전반에 걸친 주의 — 형광펜을 칠할 구절이 없으므로 '근거 범위'를 달아 점선 밑줄로 표시한다
    const procCount0 = countMarkers(text, lex.PROCESS_MARKERS) + countQuotes(text);
    const actSentences = sentences.filter((s) => s.clauses.some((c) => c.type === '행동'));
    const actCount0 = sentences.flatMap((s) => s.clauses).filter((c) => c.type === '행동').length;
    if (actCount0 >= 3 && procCount0 === 0) {
      push('listing', 0, 0, {
        global: true, penalty: 10,
        scopeStart: actSentences[0].start, scopeEnd: actSentences[actSentences.length - 1].end,
        why: '수업 활동이 나열되어 있고, 학생이 그 활동에서 무엇을 발견·판단·선택했는지가 없습니다. 점선 밑줄 범위가 나열된 활동입니다.',
      });
    }
    // 분량이 짧으면(발췌·짧은 기록) 성장 흐름은 판단하지 않는다 — 없는 것이 자연스럽다
    const growthNA = bytes < 900;
    if (!growthNA && countMarkers(text, lex.GROWTH_MARKERS) === 0 && sentences.length >= 3) {
      push('growth', 0, 0, {
        global: true, penalty: 0, scopeStart: 0, scopeEnd: text.length,
        why: '처음 생각 → 탐구 → 변화·심화의 흐름이 보이지 않습니다. 학생이 생각을 바꾼 지점이 있으면 한 문장으로 남기면 좋습니다(분량이 짧으면 없는 것이 자연스럽습니다).',
      });
    }

    issues.sort((a, b) => (a.grade === b.grade ? a.start - b.start : a.grade === 'danger' ? -1 : 1));

    /* ── 점수 ── */
    const sum = (crit) => taken().filter((i) => i.criterion === crit).reduce((n, i) => n + i.penalty, 0);
    const n = Math.max(1, sentences.length);
    const allSpecific = [...new Set(sentences.flatMap((s) => s.specific))];
    const procCount = countMarkers(text, lex.PROCESS_MARKERS) + countQuotes(text);
    const growthCount = countMarkers(text, lex.GROWTH_MARKERS);
    const clauses = sentences.flatMap((s) => s.clauses);
    const actClauses = clauses.filter((c) => c.type === '행동').length;
    const listing = actClauses >= 3 && procCount === 0;
    void listing;

    const scores = {};
    scores.evidence = clamp(100 - sum('evidence'));
    // 근거 표지가 하나도 없는(행동·사고 절이 없는) 기록은 평가어가 없어도 근거성 만점이 아니다
    if (!clauses.some((c) => (c.type === '행동' || c.type === '사고') && c.strength >= 2)) scores.evidence = Math.min(scores.evidence, 55);
    const specPerSentence = Math.min(4.5, allSpecific.length / n);
    scores.specific = clamp(round(42 + 12 * specPerSentence - sum('specific')));
    let unique = clamp(22 + 5 * Math.min(allSpecific.length, 12) + 5 * countQuotes(text) - 5 * clicheHits.length);
    const ctx = opts.classCtx;
    if (ctx && ctx.df && allSpecific.length) {
      const rare = allSpecific.filter((x) => (ctx.df.get(x) || 0) <= Math.max(2, Math.ceil(ctx.n * 0.08))).length;
      unique = 0.45 * unique + 0.55 * clamp(15 + 100 * (rare / allSpecific.length));
      if (ctx.maxSim) unique -= Math.max(0, ctx.maxSim - 0.5) * 60;
    }
    scores.unique = clamp(round(unique));
    scores.process = clamp([34, 62, 80, 91, 96][Math.min(procCount, 4)] - sum('process'));
    scores.growth = [45, 72, 90][Math.min(growthCount, 2)];
    let dup = 100 - sum('dup');
    if (ctx && ctx.maxSim) dup -= Math.max(0, ctx.maxSim - 0.5) * 100;
    scores.dup = clamp(round(dup));
    scores.exag = clamp(100 - sum('exag'));
    if (!text.trim()) Object.keys(scores).forEach((k) => (scores[k] = 0));

    // 판단을 보류하는 기준은 총점에서 빼고, 남은 기준의 가중치를 비례해서 키운다
    const na = growthNA && text.trim() ? ['growth'] : [];
    const scored = lex.CRITERIA.filter((c) => !na.includes(c.key));
    const wSum = scored.reduce((acc, c) => acc + c.weight, 0) || 1;
    const overall = round(scored.reduce((acc, c) => acc + (c.weight / wSum) * scores[c.key], 0));
    const weightOf = (crit) => (lex.CRITERIA.find((c) => c.key === crit) || { weight: 0 }).weight / wSum;
    issues.forEach((i) => { i.gain = i.criterion ? +(weightOf(i.criterion) * i.penalty).toFixed(1) : 0.3; });

    const notes = []; // 글 전반 지적은 이제 issues(global)로 다룬다

    return {
      text, sentences, issues, dismissedIssues, scores, overall, notes, na,
      danger: issues.filter((i) => i.grade === 'danger'), caution: issues.filter((i) => i.grade === 'caution'),
      swapRisk: clamp(round(100 - scores.unique + (clicheHits.length ? 5 : 0))),
      bytes, chars: text.replace(/\s/g, '').length,
      specific: allSpecific, clicheHits, skeleton: skeletonOf(text), hasSource: !!src,
    };
  }

  function verdict(a) {
    const score = typeof a === 'number' ? a : a.overall;
    const danger = typeof a === 'object' && a ? a.issues.filter((i) => i.grade === 'danger').length : 0;
    if (danger) return { key: 'red', label: `위험 ${danger}건 · 입력 불가`, stamp: '위험', sub: '입력 불가' };
    if (score >= 80) return { key: 'green', label: '기록 양호', stamp: '양호', sub: '입력 가능' };
    if (score >= 60) return { key: 'amber', label: '주의 · 보완 권장', stamp: '주의', sub: '보완 권장' };
    return { key: 'amber', label: '주의 · 재작성 권장', stamp: '주의', sub: '재작성 권장' };
  }

  /* ───────────── 처방: 교사에게 물어볼 질문 ───────────── */

  /** 이슈 → 질문. 어떤 지적이든 ‘이 문장 고쳐 쓰기’로 그 자리에서 손볼 수 있다 */
  function buildQuestion(issue, auditResult, opts = {}) {
    const q = buildQuestionBase(issue, auditResult, opts);
    if (q.mode !== 'info' && q.targets && q.targets.length && !q.actions.includes('rewrite')) {
      const at = Math.max(0, q.actions.findIndex((a) => a === 'delete' || a === 'keep'));
      q.actions = [...q.actions.slice(0, at), 'rewrite', ...q.actions.slice(at)];
    }
    // 형광펜을 누르면 바로 열릴 처방 — 고르기 형식은 권장 선택지, 나머지는 유형별 기본
    const byType = {
      evidence: 'observe', cliche: 'observe', vague: 'detail',
      knowledge: 'rewrite', selfvoice: 'rewrite', listing: 'rewrite', growth: 'rewrite',
    };
    q.primary = (q.mode === 'choice' && (q.choices.find((c) => c.primary) || {}).answer
      ? q.choices.find((c) => c.primary).answer.kind
      : byType[issue.type]) || q.actions[0] || null;
    return q;
  }

  function buildQuestionBase(issue, auditResult, opts = {}) {
    const sent = issue.global ? null : sentenceAt(auditResult.sentences, issue.start);
    const sourceHits = opts.sources && sent ? findEvidence(opts.sources, sent.text) : [];
    // 고쳐 쓸 대상 문장 — 구절 지적은 그 문장, 글 전반 지적은 근거 범위 안의 문장들
    const targets = issue.global
      ? auditResult.sentences.filter((s) => s.end > (issue.scopeStart || 0) && s.start < (issue.scopeEnd == null ? auditResult.text.length : issue.scopeEnd)).map((s) => s.text)
      : (sent ? [sent.text] : []);
    // 추천 문장 — 형광펜 구절을 지운 문장부터 보여 주고, 그 뒤에 문장 틀
    const suggestions = [];
    if (sent && !issue.global) {
      const tries = [];
      if (issue.mode === 'replace') (issue.replacements || [issue.replacement]).slice(0, 2).forEach((r) => tries.push({ kind: 'replace', replacement: r }));
      if (issue.type === 'style') tries.push({ kind: 'restyle' });
      tries.push({ kind: 'delete' });
      for (const ans of tries) {
        try {
          // 문장 하나만 넘겨 그 문장의 수정안을 얻는다
          const out = applyAnswer(sent.text, issue, ans).text.trim();
          if (out && out !== sent.text && !suggestions.includes(out)) suggestions.push(out);
        } catch (e) { /* 추천 실패는 무시 */ }
      }
    }
    const candidates = lex.CANDIDATES[issue.cat] || lex.CANDIDATES.thinking;
    // 빈칸만 주지 않고 고를 수 있는 문장 틀을 함께 준다
    const templates = lex.TEMPLATES[issue.type === 'vague' ? issue.kind : issue.type] || lex.TEMPLATES.listing;
    const q = { issueId: issue.id, type: issue.type, grade: issue.grade, sourceHits, templates, targets, suggestions };
    const noneDelete = { label: '관찰한 내용 없음 → 이 문장 삭제', answer: { kind: 'delete' } };

    switch (issue.type) {
      case 'evidence':
      case 'cliche':
        return {
          ...q,
          prompt: issue.type === 'evidence'
            ? `‘${issue.text}’라고 판단한 근거가 된, 학생의 실제 행동이 있었나요?`
            : `‘${issue.text}’ 대신 들어갈 이 학생만의 장면이 있나요?`,
          mode: 'multi', candidates, allowCustom: true,
          customPlaceholder: '직접 입력 (예: 사건 장소의 관할 문제를 근거로 일본 측 재판 권한을 반박함)',
          canKeepEval: issue.type === 'evidence' && issue.deleteMode === 'tail',
          none: issue.type === 'evidence'
            ? { label: '특별히 관찰하지 못함 → 평가 표현 삭제', answer: { kind: 'delete' } }
            : { label: '떠오르는 장면 없음 → 그대로 두기', answer: { kind: 'keep' } },
          actions: ['source', 'observe', issue.type === 'evidence' ? 'delete' : 'keep'],
        };
      case 'vague':
        if (issue.kind === 'vagueAdverb') {
          return {
            ...q, prompt: `‘${issue.text}’ — 막연한 부사입니다. 빼고 사실만 남길까요?`, mode: 'choice',
            choices: [{ label: '부사 빼기', answer: { kind: 'delete' }, primary: true }, { label: '그대로 두기', answer: { kind: 'keep' } }],
            actions: ['delete', 'keep'],
          };
        }
        return {
          ...q,
          prompt: issue.kind === 'vagueObject'
            ? `‘${issue.text}’ — 학생이 구체적으로 무엇을 다뤄 어떤 결론을 냈나요? (이 구절을 대신할 완결된 구절)`
            : `‘${issue.text}’ — 구체적으로 어떤 관점·자료·방법이었나요?`,
          mode: 'text', candidates: [], allowCustom: true,
          customPlaceholder: issue.kind === 'vagueObject' ? '예: 반복되는 시어가 마지막 연에서 체념으로 바뀐다고 해석함' : '예: 농민과 수군 지휘관의 입장에서',
          none: { label: '기억나지 않음 → 그대로 두기', answer: { kind: 'keep' } },
          actions: ['source', 'detail', 'keep'],
        };
      case 'knowledge':
      case 'selfvoice':
        return {
          ...q,
          prompt: issue.type === 'knowledge'
            ? '교과 내용을 설명할 뿐 학생이 한 일이 없습니다. 이 내용과 관련해 학생이 실제로 한 일은?'
            : '학생 소감을 옮긴 듯한 문장입니다. 선생님이 관찰한 학생의 실제 말·행동으로 바꿔 주세요.',
          mode: 'text', candidates: [], allowCustom: true,
          customPlaceholder: issue.type === 'knowledge'
            ? '예: 판별식의 부호로 실근의 개수를 판정하고 경계값을 대입해 확인함'
            : '예: 인권 침해 사례 토의에서 자신의 첫 판단이 편견에 기댔음을 사례를 들어 설명함',
          none: noneDelete, actions: ['source', 'detail', 'delete', 'keep'],
        };
      case 'listing':
        return {
          ...q,
          prompt: '활동이 나열만 되어 있습니다. 이 활동들에서 학생이 무엇을 발견·판단·선택했나요?',
          mode: 'text', candidates: [], allowCustom: true,
          customPlaceholder: '예: 배차 간격 표에서 출근 시간대의 공백을 찾아 노선 조정안을 제시함',
          none: { label: '떠오르는 장면 없음 → 그대로 두기', answer: { kind: 'keep' } },
          actions: ['rewrite', 'detail', 'keep'],
        };
      case 'growth':
        return {
          ...q,
          prompt: '탐구 전후로 학생의 생각이 달라진 지점이 있었나요? (있으면 한 문장)',
          mode: 'text', candidates: [], allowCustom: true,
          customPlaceholder: '예: 처음에는 쇄국만 보고 보수적이라고 판단했으나 호포제 자료를 읽은 뒤 판단을 수정함',
          none: { label: '그런 장면은 없었음 → 그대로 두기 (분량이 짧으면 자연스러운 일입니다)', answer: { kind: 'keep' } },
          actions: ['rewrite', 'detail', 'keep'],
        };
      case 'overflow':
        return { ...q, prompt: issue.why, mode: 'info', choices: [], actions: [] };
      case 'forbidden': {
        const what = issue.matches.map((x) => `‘${x}’`).join('·');
        // 기재 금지는 '유지'로 넘길 수 없다 — 바꾸거나 지워야 입력 가능해진다.
        // (교과 내용 속 낱말을 잘못 잡은 경우에는 교사가 본문을 직접 고쳐 다시 감사한다)
        const choices = issue.mode === 'replace' && issue.replacement
          ? [
            ...(issue.replacements || [issue.replacement]).slice(0, 3).map((r, k) => ({
              label: `‘${issue.matches[0]}’ → ‘${r}’(으)로 바꾸기`, answer: { kind: 'replace', replacement: r }, primary: k === 0,
            })),
            { label: '이 부분 삭제', answer: { kind: 'delete' } },
          ]
          : [
            { label: '이 부분 삭제', answer: { kind: 'delete' }, primary: true },
          ];
        return {
          ...q, prompt: `[${issue.titles.join('·')}] ${what} — ${issue.why}`, mode: 'choice', choices,
          actions: [...new Set(choices.map((c) => c.answer.kind))],
        };
      }
      case 'symbol':
        return {
          ...q, prompt: `‘${issue.text}’ 기호를 지울까요?`, mode: 'choice',
          choices: [{ label: '기호 지우기', answer: { kind: 'delete' }, primary: true }, { label: '그대로 두기', answer: { kind: 'keep' } }],
          actions: ['delete', 'keep'],
        };
      case 'exag':
        return {
          ...q,
          prompt: `강조 표현 ‘${issue.text}’을 뺄까요?`,
          mode: 'choice',
          choices: [
            { label: '강조어 빼기', answer: { kind: 'delete' }, primary: true },
            { label: '결과물로 확인됨 → 유지', answer: { kind: 'keep' } },
          ],
          actions: ['delete', 'keep'],
        };
      case 'source':
        return {
          ...q,
          prompt: `이 문장의 근거를 제출 자료에서 찾지 못했습니다. 선생님이 직접 확인한 내용인가요?`,
          mode: 'choice',
          choices: [
            { label: '직접 확인한 내용 → 유지', answer: { kind: 'keep', confirmed: true }, primary: true },
            { label: '확인할 수 없음 → 문장 삭제', answer: { kind: 'delete' } },
          ],
          actions: ['source', 'keep', 'delete'],
        };
      case 'style':
      default:
        return {
          ...q,
          prompt: '명사형 어미(~함)가 아닌 문장이 있습니다. 모두 명사형으로 고칠까요?',
          mode: 'choice',
          choices: [
            { label: '모든 문장 명사형으로 고치기', answer: { kind: 'restyle' }, primary: true },
            { label: '그대로 두기', answer: { kind: 'keep' } },
          ],
          actions: ['restyle', 'keep'],
        };
    }
  }

  /** 학생 한 명에게 물어볼 질문 — 위험(기재 금지)은 모두 먼저, 주의는 수정 효과가 큰 순서로 최대 limit개 */
  function topQuestions(auditResult, opts = {}, limit = 3) {
    const danger = auditResult.issues.filter((i) => i.grade === 'danger' && i.type !== 'overflow');
    const caution = auditResult.issues
      .filter((i) => i.grade === 'caution' && i.type !== 'style' && i.type !== 'symbol')
      .sort((a, b) => b.gain - a.gain || a.start - b.start)
      .slice(0, limit);
    if (caution.length < limit) {
      const minor = auditResult.issues.find((i) => i.type === 'style') || auditResult.issues.find((i) => i.type === 'symbol');
      if (minor) caution.push(minor);
    }
    return [...danger, ...caution].map((i) => ({ issue: i, question: buildQuestion(i, auditResult, opts) }));
  }

  /** 예상 점수: 선택된 이슈가 해결되었다고 가정한 점수 (감점 환원) */
  function expectedScore(auditResult, issues) {
    const s = { ...auditResult.scores };
    for (const i of issues) if (i.criterion) s[i.criterion] = clamp(s[i.criterion] + i.penalty);
    const na = auditResult.na || [];
    const scored = lex.CRITERIA.filter((c) => !na.includes(c.key));
    const wSum = scored.reduce((acc, c) => acc + c.weight, 0) || 1;
    return round(scored.reduce((acc, c) => acc + (c.weight / wSum) * s[c.key], 0));
  }

  /* ───────────── 수정 ───────────── */

  function locate(text, issue) {
    let idx = text.indexOf(issue.text, Math.max(0, issue.start - 30));
    if (idx === -1) idx = text.indexOf(issue.text);
    return idx;
  }

  function replaceRange(text, start, end, replacement) {
    let out = text.slice(0, start) + replacement + text.slice(end);
    return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,])/g, '$1').replace(/^\s+/, '').replace(/\s+$/, '');
  }

  /** 지운 평가어 앞에 매달린 관형어("대학 수준의", "매우") 걷어내기 */
  function stripModifiers(prefix) {
    const ws = prefix.replace(/\s+$/, '').split(/\s+/).filter(Boolean);
    while (ws.length) {
      const w = ws[ws.length - 1];
      if (w === '등' || /[,]$/.test(w)) break;
      const exag = lex.EXAGGERATIONS.some((e) => !e.includes(' ') && w.startsWith(e));
      if (exag || /(?:의|적인|스러운|로운|다운|높은|깊은|넓은)$/.test(w) || (ws.length >= 2 && /수준의?$|수준$/.test(w))) { ws.pop(); continue; }
      if (ws.length >= 2 && /^(?:대학|전문가|최고|높은)$/.test(ws[ws.length - 2]) === false && w === '수준') { ws.pop(); continue; }
      break;
    }
    // "대학 수준의" 처럼 두 어절 수식어의 앞 어절
    while (ws.length && /^(?:대학|전문가|최고|매우|대단히)$/.test(ws[ws.length - 1])) ws.pop();
    return ws.join(' ') + (ws.length ? ' ' : '');
  }

  /** 문장에서 [relStart, relEnd) 구간을 지우고 자연스럽게 닫는다 */
  function deleteInSentence(sentenceText, relStart, relEnd, mode) {
    const prefix = sentenceText.slice(0, relStart);
    const suffix = sentenceText.slice(relEnd);
    const suffixBody = suffix.replace(/^[\s.!?]+|[\s.!?]+$/g, '');
    if (mode === 'sentence') return '';
    if (!suffixBody) {
      const trimmed = stripModifiers(prefix);
      if (!trimmed.trim()) return '';
      // 서술어 없이 부사어만 남으면("임진왜란 수업에") 문장째 지운다
      const lastWord = trimmed.trim().split(/\s+/).pop();
      const predicate = ko.isNominalEnding(lastWord) || /(?:하는\s*등|는\s*등|은\s*등|하면서|면서|하였으며|했으며|하였고|했고|하며|으며|하여|해서|하고|며|고)$/.test(trimmed.trim());
      if (!predicate) return '';
      return ko.closeClause(trimmed);
    }
    // 가운데에 있는 절: 해당 구간만 제거
    if (mode === 'word') return (prefix + suffix.replace(/^\s+/, '')).replace(/\s{2,}/g, ' ').trim();
    const cleanedPrefix = prefix.replace(/\s+$/, '');
    // "X에 관심을 가지고 Y" → "X에 대해 Y"
    if (/에$/.test(cleanedPrefix) && /관심|흥미|열정/.test(sentenceText.slice(relStart, relEnd))) {
      return (cleanedPrefix.replace(/에$/, '에 대해') + ' ' + suffix.trimStart()).trim();
    }
    if (mode === 'phrase') {
      // "모둠 활동에 적극적으로 참여하며 X" → 목적어까지 절 전체를 지운다
      const [cs, ce] = clauseRange(sentenceText, relStart, relEnd);
      return (sentenceText.slice(0, cs) + sentenceText.slice(ce).trimStart()).replace(/\s{2,}/g, ' ').trim();
    }
    return (prefix + suffix.trimStart()).replace(/\s{2,}/g, ' ').trim();
  }

  /** 절 단위 삭제 범위 계산 (문장 기준 상대 오프셋) */
  function clauseRange(sentenceText, relStart, relEnd) {
    const clauses = splitClauses(sentenceText);
    const hit = clauses.filter((c) => relStart < c.end && relEnd > c.start);
    if (!hit.length) return [relStart, relEnd];
    const first = hit[0];
    const last = hit[hit.length - 1];
    return [first.start, last.end];
  }

  /**
   * 교사 응답 적용. 반환: { text, facts: [추가된 사실], dismissed: 서명|null, changed }
   * answer.kind: facts | delete | keep | detail | restyle
   */
  function applyAnswer(text, issue, answer) {
    const idx = locate(text, issue);
    const res = { text, facts: [], dismissed: null, changed: false };
    if (answer.kind === 'keep') { res.dismissed = issue.signature; res.confirmed = !!answer.confirmed; return res; }
    if (answer.kind === 'restyle') {
      const out = ko.splitSentences(text).map((x) => {
        const w = (words(x.text).pop() || '').replace(/[.!?]+$/, '');
        return ko.isNominalEnding(w) && !/다$/.test(w) ? x.text : ko.asRecordSentence(x.text);
      }).join(' ');
      res.text = out;
      res.changed = out !== text;
      return res;
    }
    // 문장 고쳐 쓰기 — 형광펜이 걸린 문장(또는 교사가 고른 문장)을 교사가 쓴 문장으로 그 자리에서 교체
    if (answer.kind === 'rewriteSentence') {
      const target = String(answer.target || '').trim();
      const next = String(answer.text || '').trim();
      if (!target || !next) return res;
      const at = text.indexOf(target);
      if (at === -1) return res;
      res.text = replaceRange(text, at, at + target.length, ko.asRecordSentence(next));
      res.facts = [next];
      res.changed = res.text !== text;
      return res;
    }

    if ((issue.type === 'listing' || issue.type === 'growth') && answer.kind === 'detail') {
      const detail = String(answer.detail || '').trim();
      if (!detail) return res;
      res.text = `${text.replace(/\s+$/, '')} ${ko.asRecordSentence(detail)}`.trim();
      res.facts = [detail];
      res.changed = true;
      return res;
    }
    if (idx === -1) return res;

    const sentences = ko.splitSentences(text);
    const s = sentenceAt(sentences, idx);
    const relStart = idx - s.start;
    const relEnd = relStart + issue.text.length;

    const rebuildSentence = (newSentence) => {
      const out = replaceRange(text, s.start, s.end, newSentence);
      return out.replace(/\s{2,}/g, ' ');
    };

    if (answer.kind === 'replace') {
      const rep = (answer.replacement || issue.replacement || '').trim();
      if (!rep) return res;
      let after = text.slice(idx + issue.text.length);
      const pm = after.match(/^(으로|로|을|를|이|가|은|는|과|와)/);
      let replacement = rep;
      if (pm) {
        const pair = { 을: '을/를', 를: '을/를', 이: '이/가', 가: '이/가', 은: '은/는', 는: '은/는', 과: '과/와', 와: '과/와', 으로: '으로/로', 로: '으로/로' }[pm[1]];
        replacement = ko.josa(rep, pair);
        after = after.slice(pm[1].length);
      }
      res.text = (text.slice(0, idx) + replacement + after).replace(/[ \t]{2,}/g, ' ');
      res.changed = res.text !== text;
      return res;
    }

    if (answer.kind === 'delete') {
      let newS;
      if (issue.type === 'symbol') {
        newS = deleteInSentence(s.text, relStart, relEnd, 'word');
      } else if (issue.type === 'knowledge' || issue.type === 'selfvoice') {
        newS = '';
      } else if (issue.type === 'forbidden') {
        const [cs, ce] = clauseRange(s.text, relStart, relEnd);
        newS = deleteInSentence(s.text, cs, ce, 'clause');
      } else if (issue.type === 'exag' || issue.type === 'cliche' || (issue.type === 'vague' && issue.kind === 'vagueAdverb')) {
        let len = issue.type === 'vague' ? (issue.text.match(/^(?:깊이\s*있게|심도\s*있게|심층적으로|다각적으로|폭넓게)\s*/) || [''])[0].length : issue.text.length;
        const tailParticle = s.text.slice(relStart + len).match(/^(?:의|인|한|으로|로|하게|히)(?=\s|$)/);
        if (issue.type === 'exag' && tailParticle) len += tailParticle[0].length;
        newS = deleteInSentence(s.text, relStart, relStart + len, 'word');
      } else if (issue.type === 'source') {
        newS = '';
      } else {
        newS = deleteInSentence(s.text, relStart, relEnd, issue.deleteMode === 'phrase' ? 'phrase' : issue.deleteMode || 'tail');
      }
      res.text = rebuildSentence(newS);
      res.changed = res.text !== text;
      return res;
    }

    if (answer.kind === 'detail') {
      const detail = String(answer.detail || '').trim();
      if (!detail) return res;
      let newSpan;
      if (issue.type === 'knowledge' || issue.type === 'selfvoice') {
        res.text = rebuildSentence(ko.asRecordSentence(detail));
        res.facts = [detail];
        res.changed = true;
        return res;
      }
      if (issue.kind === 'vagueObject') {
        // "전쟁의 [원인과 결과]를 분석하고" 같은 부분 치환은 관형어가 어긋나므로 절째 바꾼다
        const [cs, ce] = clauseRange(s.text, relStart, relEnd);
        const isLast = !s.text.slice(ce).replace(/[\s.!?]/g, '');
        const sentenceForm = ko.asRecordSentence(detail);
        const newS = isLast
          ? s.text.slice(0, cs) + sentenceForm
          : `${s.text.slice(0, cs)}${ko.toConnective(sentenceForm)} ${s.text.slice(ce).trimStart()}`;
        res.text = rebuildSentence(newS.replace(/\s{2,}/g, ' ').trim());
        res.facts = [detail];
        res.changed = true;
        return res;
      }
      newSpan = detail;
      res.text = replaceRange(text, idx, idx + issue.text.length, newSpan);
      res.facts = [detail];
      res.changed = true;
      return res;
    }

    if (answer.kind === 'facts') {
      const facts = (answer.facts || []).map((f) => String(f).trim()).filter(Boolean);
      if (!facts.length) return res;
      let base;
      if (issue.type === 'evidence' && answer.keepEval && issue.deleteMode === 'tail') {
        base = deleteInSentence(s.text, relStart, relEnd, 'tail');
        const evalCore = issue.text.replace(new RegExp(`(?:${lex.EXAGGERATIONS.join('|')})\\s*`, 'g'), '').trim();
        const joined = ko.toDeung(ko.joinFacts(facts)) + ' ' + evalCore.replace(/[.]+$/, '') + '.';
        res.text = rebuildSentence([base, joined].filter(Boolean).join(' '));
      } else if (issue.type === 'cliche') {
        res.text = rebuildSentence([s.text, ko.joinFacts(facts)].join(' '));
      } else {
        base = deleteInSentence(s.text, relStart, relEnd, issue.deleteMode === 'phrase' ? 'phrase' : 'tail');
        res.text = rebuildSentence([base, ko.joinFacts(facts)].filter(Boolean).join(' '));
      }
      res.facts = facts;
      res.changed = res.text !== text;
      return res;
    }
    return res;
  }

  const APPLY_ORDER = { forbidden: 0, symbol: 1, exag: 1, cliche: 2, vague: 2, knowledge: 3, selfvoice: 3, source: 4, evidence: 5, style: 6, listing: 7, growth: 7, overflow: 8 };

  /**
   * 한 학생의 여러 응답을 한꺼번에 적용. 지우는 처방 먼저, 문장을 닫거나 사실을 덧붙이는 처방은 나중에.
   * items: [{ issue, answer }] → { text, facts, dismissed: [], confirmed }
   */
  function applyAnswers(text, items) {
    const out = { text, facts: [], dismissed: [], confirmed: 0 };
    [...items]
      .filter((x) => x.answer)
      .sort((a, b) => (APPLY_ORDER[a.issue.type] - APPLY_ORDER[b.issue.type])
        // 지우기는 뒤에서부터, 덧붙이기(근거·원자료)는 앞에서부터
        || (APPLY_ORDER[a.issue.type] >= 4 ? a.issue.start - b.issue.start : b.issue.start - a.issue.start))
      .forEach(({ issue, answer }) => {
        const r = applyAnswer(out.text, issue, answer);
        out.text = r.text;
        out.facts.push(...r.facts);
        if (r.dismissed) out.dismissed.push(r.dismissed);
        if (r.confirmed) out.confirmed++;
      });
    return out;
  }

  /* ───────────── 사실 가드: AI 임의 추가 0건 ───────────── */

  const CONNECTIVE_TEXT = '특히 또한 이 과정에서 과정에서 이를 바탕으로 이를 통해 그 결과 이후 등 하고 하여 하며 하는 함 함. 및 와 과 을 를 이 가 은 는 에 의 로 으로 에서 대해 대한 중심으로 통해 바탕으로 관련 관련된 자신의 스스로 모습 보임 것 수 있음 점';

  function corpusOf(texts) {
    const parts = [];
    for (const t of texts) for (const w of words(t)) parts.push(...ko.stemVariants(w));
    return ' ' + parts.join(' ') + ' ' + texts.join(' ').replace(/\s+/g, '') + ' ';
  }

  /**
   * 수정본의 어절 중 원문·교사 확인 사실·연결어 어디에도 없는 것 = "새로 들어간 표현".
   * 규칙 수정은 구조상 0건이어야 하며, 완료 보고서의 "AI 임의 추가"는 이 값을 다시 세어 보여 준다.
   */
  // 기재 금지 처방이 넣는 상위 일반어(포털사이트·인공지능 챗봇·관련 기관 …)는 학생 사실이 아니라 규정상 대체어이므로 허용
  const REPLACEMENT_TEXT = [
    ...lex.BRAND_TERMS.map((t) => t[1]),
    '박물관 기념관 과학관 미술관 병원 방송사 언론사 금융기관 관련 연구기관 공공기관 관련 기관 학교 영재교육원 발명교육센터',
  ].join(' ');

  function guard(original, revised, facts = []) {
    const corpus = corpusOf([original, ...facts, CONNECTIVE_TEXT, REPLACEMENT_TEXT]);
    const novel = [];
    for (const w of words(revised)) {
      const clean = w.replace(/[^가-힣A-Za-z0-9]/g, '');
      if (clean.length < 2) continue;
      const vars = ko.stemVariants(clean).filter((v) => v.length >= 2);
      if (!vars.length) continue;
      if (!vars.some((v) => corpus.includes(v))) novel.push(w.replace(/[.,]+$/, ''));
    }
    // 숫자: 원문·확인 사실에 없는 수치
    const nums = (t) => String(t).match(/\d+(?:\.\d+)?/g) || [];
    const knownNums = new Set([original, ...facts].flatMap(nums));
    nums(revised).forEach((n) => { if (!knownNums.has(n)) novel.push(n); });
    // 부정 표현: 원문 문장과 거의 같은데 '못·않·없' 유무가 뒤바뀐 경우
    const NEG = /못|않|없|아니/;
    const origSents = ko.splitSentences(original).map((x) => x.text);
    const bigrams = (t) => {
      const x = String(t).replace(/지\s*(?:못|않)[가-힣]*|못|않|없[가-힣]*|아니[가-힣]*|\s|[.]/g, '');
      const set = new Set();
      for (let i = 0; i < x.length - 1; i++) set.add(x.slice(i, i + 2));
      return set;
    };
    for (const rs of ko.splitSentences(revised)) {
      const rb = bigrams(rs.text);
      const twin = origSents.find((o) => {
        const ob = bigrams(o);
        let inter = 0;
        ob.forEach((b) => { if (rb.has(b)) inter++; });
        return ob.size && inter / Math.max(ob.size, rb.size) >= 0.6;
      });
      if (twin && NEG.test(twin) !== NEG.test(rs.text) && !facts.some((f) => rs.text.includes(String(f).slice(0, 6)))) {
        novel.push(`(부정 표현 변경) ${rs.text.slice(0, 24)}`);
      }
    }
    return { ok: novel.length === 0, novel: [...new Set(novel)] };
  }

  /* ───────────── 학급 감사 ───────────── */

  function trigrams(text) {
    const t = String(text).replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  }

  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    a.forEach((x) => { if (b.has(x)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  function lcsRatio(a, b) {
    if (!a.length || !b.length) return 0;
    const dp = Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      let prev = 0;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    return (2 * dp[b.length]) / (a.length + b.length);
  }

  /** 문장 구조 유사도 = 표현(3-gram) 0.45 + 구조(DNA) 0.55 */
  function similarity(a, b) {
    const expr = jaccard(a.grams, b.grams);
    const struct = a.skeleton.length >= 3 && b.skeleton.length >= 3 ? lcsRatio(a.skeleton, b.skeleton) : 0;
    return { score: 0.45 * Math.min(1, expr * 2.2) + 0.55 * struct, expr, struct };
  }

  /**
   * students: [{ id, name, text, source }]
   */
  function classAudit(students, opts = {}) {
    const dismissedFor = opts.dismissedFor || (() => new Set());
    const first = students.map((st) => {
      const a = audit(st.text, { sources: st.source, dismissed: dismissedFor(st.id) });
      return { st, a, grams: trigrams(st.text), skeleton: a.skeleton, stems: new Set(a.specific) };
    });
    const df = new Map();
    first.forEach((r) => r.stems.forEach((x) => df.set(x, (df.get(x) || 0) + 1)));

    const pairs = [];
    const maxSim = new Map();
    for (let i = 0; i < first.length; i++) {
      for (let j = i + 1; j < first.length; j++) {
        const sim = similarity(first[i], first[j]);
        const id1 = first[i].st.id;
        const id2 = first[j].st.id;
        if (sim.score >= 0.6) pairs.push({ a: id1, b: id2, score: sim.score, expr: sim.expr, struct: sim.struct });
        maxSim.set(id1, Math.max(maxSim.get(id1) || 0, sim.score));
        maxSim.set(id2, Math.max(maxSim.get(id2) || 0, sim.score));
      }
    }
    pairs.sort((x, y) => y.score - x.score);

    const results = first.map((r) => {
      const a = audit(r.st.text, {
        sources: r.st.source, dismissed: dismissedFor(r.st.id),
        classCtx: { df, n: students.length, maxSim: maxSim.get(r.st.id) || 0 },
      });
      return { ...r.st, audit: a, maxSim: maxSim.get(r.st.id) || 0, verdict: verdict(a) };
    });

    // 세특 DNA: 같은 문장 구조를 공유하는 학생 묶음
    const groups = new Map();
    results.forEach((r) => {
      const sk = r.audit.skeleton;
      if (sk.length < 3) return;
      const key = sk.join('→');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r.id);
    });
    const patterns = [...groups.entries()]
      .filter(([, ids]) => ids.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, ids], i) => ({
        name: `반복 패턴 ${String.fromCharCode(65 + i)}`, key, ids,
        template: key.split('→').map((c) => lex.SKELETON_LABEL[c] || c).join(' → '),
      }));

    // 상투 표현 빈도
    const clicheCount = new Map();
    results.forEach((r) => r.audit.clicheHits.forEach((h) => clicheCount.set(h.text, (clicheCount.get(h.text) || 0) + 1)));
    const topCliches = [...clicheCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const count = (fn) => results.filter(fn).length;
    const avg = (key) => round(results.reduce((n, r) => n + r.audit.scores[key], 0) / Math.max(1, results.length));
    const criteriaAvg = Object.fromEntries(lex.CRITERIA.map((c) => [c.key, avg(c.key)]));
    const health = round(results.reduce((n, r) => n + r.audit.overall, 0) / Math.max(1, results.length));
    const issueTotals = {};
    results.forEach((r) => r.audit.issues.forEach((i) => (issueTotals[i.type] = (issueTotals[i.type] || 0) + 1)));
    const questionsTotal = results.reduce((n, r) => n + topQuestions(r.audit).length, 0);

    const weakest = [...lex.CRITERIA].sort((a, b) => criteriaAvg[a.key] - criteriaAvg[b.key]).slice(0, 3);

    return {
      results, pairs, patterns, topCliches, criteriaAvg, health, issueTotals,
      triage: {
        red: count((r) => r.verdict.key === 'red'),
        amber: count((r) => r.verdict.key === 'amber'),
        green: count((r) => r.verdict.key === 'green'),
      },
      stats: {
        students: results.length,
        lowUnique: count((r) => r.audit.scores.unique < 50),
        noEvidence: count((r) => r.audit.issues.some((i) => i.type === 'evidence')),
        dupPairs: pairs.length,
        listing: count((r) => r.audit.notes.some((n) => n.kind === 'listing')),
        lowProcess: count((r) => r.audit.scores.process < 50),
        forbidden: count((r) => r.audit.issues.some((i) => i.grade === 'danger')),
        dangerIssues: results.reduce((n, r) => n + r.audit.issues.filter((i) => i.grade === 'danger').length, 0),
      },
      estMinutes: Math.max(1, Math.round((questionsTotal * 20) / 60)),
      observe: weakest.map((c) => ({ criterion: c, avg: criteriaAvg[c.key], points: lex.OBSERVE_POINTS[c.key] })),
    };
  }

  /** 문장 단위 비교: 원문에 없던 문장 수 */
  function changedSentences(original, revised) {
    const orig = new Set(ko.splitSentences(original).map((s) => s.text));
    return ko.splitSentences(revised).filter((s) => !orig.has(s.text)).length;
  }

  /** 어절 단위 diff (LCS) */
  function diffWords(a, b) {
    const A = words(a);
    const B = words(b);
    const m = A.length;
    const n = B.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (A[i] === B[j]) { out.push({ op: '=', w: A[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: '-', w: A[i++] }); }
      else { out.push({ op: '+', w: B[j++] }); }
    }
    while (i < m) out.push({ op: '-', w: A[i++] });
    while (j < n) out.push({ op: '+', w: B[j++] });
    return out;
  }

  SA.engine = {
    ISSUE_META, GRADE, audit, verdict, buildQuestion, topQuestions, expectedScore, applyAnswer, applyAnswers, guard,
    classAudit, findEvidence, changedSentences, diffWords, splitClauses, skeletonOf,
    specificStems, evidenceStrength,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.engine;
})(typeof globalThis !== 'undefined' ? globalThis : window);
