import { analyze } from '../../server/engine.js';
import { validateText } from '../../server/extract.js';
import { findPublicSources } from '../../server/auto-sources.js';

export async function browserScan(body, { publicProvider = findPublicSources } = {}) {
  const { text, sources = [], settings = {}, publicSearch = false } = body || {};
  if (typeof text !== 'string' || !Array.isArray(sources) || sources.length > 20) throw new Error('원문과 비교자료를 확인해 주세요. 비교자료는 최대 20개입니다.');
  const targetText = validateText(text);
  const docs = sources.map((s, i) => ({ id: `manual-${i}`, title: String(s.title || `비교자료 ${i + 1}`).slice(0, 150), text: validateText(s.text), reference: true, type: 'manual' }));
  if (docs.reduce((n, s) => n + s.text.length, 0) > 1000000) throw new Error('비교자료는 합계 100만 자까지 가능합니다.');
  const web = publicSearch ? await publicProvider(targetText) : { documents: [], status: 'disabled', limitations: [] };
  let used = docs.reduce((n, s) => n + s.text.length, 0), webDocuments = 0;
  for (const s of web.documents.slice(0, 4)) {
    if (used + s.text.length > 1000000) { web.status = 'partial'; web.limitations.push('용량을 초과한 공개자료는 제외했습니다.'); continue; }
    docs.push({ ...s, id: `web-${webDocuments++}`, reference: true, type: 'web' });
    used += s.text.length;
  }
  const report = analyze({ id: 'quick', title: String(body.title || '빠른 비교 문서').slice(0, 150), text: targetText, kind: 'research' }, docs, {
    minWords: Number(settings.minWords ?? 6), excludeQuotes: settings.excludeQuotes === true,
    excludeReferences: settings.excludeReferences !== false,
    ignorePhrases: typeof settings.ignorePhrases === 'string' ? settings.ignorePhrases.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50) : [],
  });
  report.evidence = {
    status: docs.length ? 'compared' : 'insufficient', localDocuments: 0, manualDocuments: sources.length, webDocuments,
    availableLocalDocuments: 0, omittedLocalDocuments: 0, webStatus: web.status,
    limitations: ['인터넷 전체·유료 논문·비공개 문서는 검색하지 않습니다. 일치율은 표절 확률이 아닙니다.', ...web.limitations,
      ...(!docs.length ? ['비교할 자료가 없어 일치율을 계산할 근거가 없습니다.'] : [])],
    sources: docs.map(s => ({ id: s.id, title: s.title, url: s.url || '', type: s.type, characters: s.text.length })),
    method: { algorithm: 'normalized-word-overlap', minWords: report.settings.minWords },
  };
  if (!docs.length) report.score = null;
  report.coverage = docs.length ? `직접 추가한 자료 ${sources.length}개, 공개자료 ${webDocuments}개를 이 브라우저에서 비교했습니다.` : '비교자료가 없어 검사 근거가 부족합니다. 일치율을 산출하지 않았습니다.';
  return report;
}
