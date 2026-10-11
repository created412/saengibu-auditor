// 학교 공통 지침 — 1학년부 「생기부 수정사항 · 기재금지어 확인」 시트 항목이 뒤로 가지 않게 못 박는다
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

['korean', 'lexicon', 'engine'].forEach((f) => require(path.join(__dirname, '..', 'js', `${f}.js`)));
const E = globalThis.SA.engine;

const dangerOf = (t, title) => E.audit(t).danger.find((i) => i.titles.some((x) => x.includes(title)));
const cautionOf = (t, type) => E.audit(t).caution.find((i) => i.type === type);

test('대체어 표 — 상호는 위험으로 잡고 학교가 정한 일반어를 제안한다', () => {
  const cases = [
    ['반크 활동으로 독도 자료를 정리함.', '사이버 외교 사절단'],
    ['제페토에서 전시관을 만들어 작품을 소개함.', '메타버스 플랫폼'],
    ['게더타운에서 모둠 회의를 진행함.', '메타버스 플랫폼'],
    ['망고보드로 카드뉴스를 제작함.', '디자인 제작 도구'],
    ['프리미어 프로로 영상을 편집함.', '영상 편집 프로그램'],
    ['크롬북으로 자료를 검색함.', '휴대용 컴퓨터'],
    ['유엔 지속가능발전목표를 조사하여 발표함.', '국제기구'],
    ['세계 보건 기구의 통계 자료를 인용함.', '국제기구'],
    ['웨이브에서 다큐멘터리를 시청하고 요약함.', '동영상 플랫폼'],
    ['다음 포털에서 기사를 검색함.', '포털사이트'],
    ['롯데타워를 답사하고 높이를 측정함.', '대형 복합 시설'],
  ];
  for (const [t, rep] of cases) {
    const i = dangerOf(t, '상호명');
    assert.ok(i, t);
    assert.equal(i.replacement, rep, t);
  }
});

test('대체어 표 — 일반어와 겹치는 이름은 그 뜻일 때만', () => {
  for (const t of ['다음 시간에 발표할 내용을 정리함.', '라인을 따라 도형을 그리고 넓이를 구함.', '웨이브 형태의 그래프를 해석함.', 'PPT를 제작하여 DNA 복제 과정을 설명함.']) {
    assert.ok(!dangerOf(t, '상호명'), t);
  }
});

test('기재 불가 — 산출물 실적 · 수업 외 개별 보고서 · 교사명', () => {
  assert.ok(dangerOf("'기후 변화와 농업'이라는 제목의 탐구 보고서를 작성함.", '산출물 실적'));
  assert.ok(dangerOf('소요 시간 10시간의 탐구를 진행함.', '산출물 실적'));
  assert.ok(dangerOf('방학 중 작성한 보고서를 제출하여 발표함.', '수업 외 개별 보고서'));
  assert.ok(dangerOf('개인적으로 작성한 탐구 보고서를 제출함.', '수업 외 개별 보고서'));
  assert.ok(!dangerOf('수업 시간에 모둠원과 함께 보고서를 작성함.', '수업 외 개별 보고서'));
  const tc = dangerOf('김영희 선생님의 조언을 받아 실험을 수정함.', '교사명');
  assert.ok(tc && tc.replacement === '교사');
  assert.ok(!dangerOf('담임 선생님과 상담 후 진로 계획을 세움.', '교사명'));
  assert.ok(!dangerOf('국어 선생님의 피드백을 반영해 글을 고침.', '교사명'));
});

test('괄호 앞 공백 — 아몬드 (손원평) → 아몬드(손원평)', () => {
  const t = '아몬드 (손원평)를 읽고 인물의 심리를 분석함.';
  const i = dangerOf(t, '맞춤법');
  assert.ok(i);
  assert.equal(E.applyAnswer(t, i, { kind: 'replace' }).text, '아몬드(손원평)를 읽고 인물의 심리를 분석함.');
  assert.ok(!dangerOf('아몬드(손원평)를 읽고 인물의 심리를 분석함.', '맞춤법'));
});

test('영문 약어 — 학교 대체어는 주의로 잡고 한 번에 바꾼다, 일반화된 명사는 두고, 따옴표 안은 두고', () => {
  const t = 'VR 기기로 가상 박물관을 체험하고 소감을 발표함.';
  const i = cautionOf(t, 'foreign');
  assert.ok(i && i.replacement === '가상현실');
  assert.equal(E.applyAnswer(t, i, { kind: 'replace' }).text, '가상현실 기기로 가상 박물관을 체험하고 소감을 발표함.');
  assert.equal(cautionOf('파이썬으로 자료를 정렬하는 코드를 작성함.', 'foreign').replacement, '프로그래밍 언어');
  assert.equal(cautionOf('MBTI 검사를 하고 자신의 성향을 정리함.', 'foreign').replacement, '성격유형 검사');
  assert.ok(!cautionOf('PPT를 제작하여 DNA 복제 과정을 설명함.', 'foreign'));
  const r = cautionOf('Romeo and Juliet의 등장인물 관계를 정리함.', 'foreign');
  assert.ok(r && r.text === 'Romeo and Juliet', '이어진 영문은 한 묶음');
  assert.ok(!cautionOf("'Romeo and Juliet'의 등장인물 관계를 정리함.", 'foreign'), '따옴표 안 제목은 두기');
});

test('둥근 따옴표 → 직선 따옴표', () => {
  const t = '‘인권’의 의미를 자신의 말로 정리함.';
  const i = cautionOf(t, 'quote');
  assert.ok(i);
  assert.equal(E.applyAnswer(t, i, { kind: 'replace' }).text, "'인권'의 의미를 자신의 말로 정리함.");
  assert.equal(E.audit(t).overall, E.audit("'인권'의 의미를 자신의 말로 정리함.").overall, '점수는 깎지 않는다');
});

test('학생 입장 서술(~다짐함·~깨달음·~생각해 봄) — 교사가 본 행동이 없으면 소감 어투', () => {
  for (const t of ['환경 보호를 실천하겠다고 다짐함.', '소설을 읽고 가족의 소중함을 깨달음.', '봉사의 가치에 대해 생각해 봄.']) {
    assert.ok(cautionOf(t, 'selfvoice'), t);
  }
  assert.ok(!cautionOf('가족의 소중함을 주제로 쓴 수필을 학급에 낭독함.', 'selfvoice'));
});
