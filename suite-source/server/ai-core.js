import model from './ai-model.json' with { type: 'json' };
export { model };
export function splitAiText(text) {
  const segments = [];
  let start = 0;
  while (start < text.length && segments.length < model.maxSegments) {
    let end = Math.min(start + 600, text.length);
    if (end < text.length) {
      const boundary = text.slice(start + 300, end).search(/\s+\S*$/);
      if (boundary >= 0) end = start + 300 + boundary + 1;
      if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
    }
    const chunk = text.slice(start, end);
    segments.push({
      id: `ai-${segments.length}`,
      start,
      end,
      text: chunk,
      words: chunk.trim().split(/\s+/).filter(Boolean).length,
    });
    start = end;
  }
  return { segments, omittedCharacters: text.length - start };
}
export async function inspectAiText(text, { infer, signal } = {}) {
  const result = {
    version: 1,
    model,
    createdAt: new Date().toISOString(),
    processing: 'local',
    status: 'complete',
    suspectedPercent: null,
    segments: [],
    totalCharacters: text.length,
    analyzedWords: 0,
    uncertainWords: 0,
    omittedCharacters: 0,
    limitations: [
      '실험 모델입니다. 생기부·학생 과제 및 최신 생성 모델에 대한 독립 정확도는 아직 검증되지 않았습니다.',
      '모델 점수는 보정된 AI 작성 확률이 아닙니다. 표절 일치율과 합산하지 않습니다.',
      '0.2 미만은 낮은 신호, 0.8 이상은 AI 의심, 그 사이는 판단 보류로 표시합니다. 이 기준은 학교 자료로 보정되지 않았습니다.',
    ],
  };
  if (text.trim().length < model.minCharacters)
    return {
      ...result,
      status: 'insufficient',
      reason: 'AI 분석에는 300자 이상의 한국어 본문이 필요합니다.',
    };
  const letters = (text.match(/\p{L}/gu) || []).length;
  if ((text.match(/[가-힣]/g) || []).length / Math.max(1, letters) < 0.4)
    return {
      ...result,
      status: 'unsupported',
      reason: '한국어 중심의 글만 지원합니다. 이 글은 AI 판정을 보류합니다.',
    };
  const split = splitAiText(text);
  const outputs = await infer(split.segments, { signal });
  if (!Array.isArray(outputs) || outputs.length !== split.segments.length)
    throw new Error('AI 모델 출력 구간 수가 일치하지 않습니다.');
  result.omittedCharacters = split.omittedCharacters;
  result.status = split.omittedCharacters ? 'partial' : 'complete';
  let suspectedWords = 0;
  result.segments = split.segments.map((s, i) => {
    const out = outputs[i];
    if (
      !out ||
      !Number.isInteger(out.tokens) ||
      out.tokens < 0 ||
      (out.score !== null && (!Number.isFinite(out.score) || out.score < 0 || out.score > 1))
    )
      throw new Error('AI 모델 출력 값이 올바르지 않습니다.');
    const held = out.score === null || s.text.trim().length < 150;
    const decision = held
      ? 'not-analyzed'
      : out.score >= model.thresholds.high
        ? 'ai-suspected'
        : out.score < model.thresholds.low
          ? 'low-signal'
          : 'uncertain';
    if (!held) result.analyzedWords += s.words;
    if (decision === 'ai-suspected') suspectedWords += s.words;
    if (decision === 'uncertain' || held) result.uncertainWords += s.words;
    if (held) result.status = 'partial';
    return {
      ...s,
      score: held ? null : out.score,
      tokens: out.tokens,
      decision,
      reason: held ? '분량 또는 토큰 범위가 부족하거나 초과하여 미검사' : null,
    };
  });
  result.suspectedPercent = result.analyzedWords
    ? Math.round((suspectedWords / result.analyzedWords) * 1000) / 10
    : null;
  if (result.omittedCharacters)
    result.limitations.push(
      `처리 한도 ${model.maxSegments}구간을 넘어 뒤쪽 ${result.omittedCharacters}자는 검사하지 않았습니다.`,
    );
  if (!result.analyzedWords) {
    result.status = 'insufficient';
    result.reason = '유효한 AI 분석 구간이 없습니다.';
  }
  return result;
}
