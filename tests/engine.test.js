// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

['korean', 'lexicon', 'engine', 'demo'].forEach((f) => require(path.join(__dirname, '..', 'js', `${f}.js`)));
const { ko, engine: E, demo } = globalThis.SA;

test('명사형 종결·연결형 변환', () => {
  assert.equal(ko.closeClause('재판의 부당성을 파악하는 등'), '재판의 부당성을 파악함.');
  assert.equal(ko.closeClause('자료를 읽는 등'), '자료를 읽음.');
  assert.equal(ko.toConnective('주장을 비교함.'), '주장을 비교하고');
  assert.equal(ko.toDeung('책을 읽음'), '책을 읽는 등');
  assert.equal(ko.joinFacts(['관할권 문제를 지적했다', '두 주장을 비교함']), '관할권 문제를 지적하고 두 주장을 비교함.');
  assert.equal(ko.josa('재판 관할권 문제', '을/를'), '재판 관할권 문제를');
});

test('나이스 바이트: 한글 3, ASCII 1, 개행 1', () => {
  assert.equal(ko.neisBytes('가a\n'), 5);
});

test('같은 입력은 언제나 같은 점수 (결정론)', () => {
  const a = E.audit(demo.single.text, { sources: demo.single.source });
  const b = E.audit(demo.single.text, { sources: demo.single.source });
  assert.equal(a.overall, b.overall);
  assert.deepEqual(a.scores, b.scores);
});

test('대화 예시 세특: 근거 없는 평가어와 추상 표현을 찾는다', () => {
  const a = E.audit(demo.single.text);
  const types = a.issues.map((i) => `${i.type}:${i.text}`);
  assert.ok(types.includes('evidence:뛰어난 역사적 사고력을 보여줌'));
  assert.ok(types.includes('vague:문제점을 분석함'));
  assert.ok(a.overall >= 55 && a.overall <= 80, `점수 ${a.overall}`);
});

test('교사 확인 사실로 복구하면 근거 부족이 사라지고 점수가 오른다', () => {
  const a = E.audit(demo.single.text);
  const ev = a.issues.find((i) => i.type === 'evidence');
  const r = E.applyAnswer(a.text, ev, { kind: 'facts', facts: ['일본 측 논리와 안중근의 주장을 비교함'], keepEval: true });
  assert.match(r.text, /일본 측 논리와 안중근의 주장을 비교하는 등 뛰어난 역사적 사고력을 보여줌\.$/);
  const after = E.audit(r.text);
  assert.ok(!after.issues.some((i) => i.type === 'evidence'));
  assert.ok(after.overall > a.overall);
  assert.ok(E.guard(a.text, r.text, r.facts).ok);
});

test('관찰하지 못함 → 평가 표현만 지우고 문장을 자연스럽게 닫는다', () => {
  const a = E.audit(demo.single.text);
  const ev = a.issues.find((i) => i.type === 'evidence');
  const r = E.applyAnswer(a.text, ev, { kind: 'delete' });
  assert.match(r.text, /국제법적 관점에서 재판의 부당성을 파악함\.$/);
});

test('기재 금지(대회·수상)는 절 단위로 삭제된다', () => {
  const t = '교내 역사토론대회에서 최우수상을 수상하는 등 대학 수준의 탁월한 역사 인식을 보여줌.';
  const a = E.audit(t);
  const f = a.issues.find((i) => i.type === 'forbidden');
  assert.ok(f);
  const r = E.applyAnswer(t, f, { kind: 'delete' });
  assert.equal(r.text, '대학 수준의 탁월한 역사 인식을 보여줌.');
});

test('문장 중간의 참여 상투어는 절째로 지운다', () => {
  const t = '모둠 활동에 적극적으로 참여하며 성실한 태도를 보임.';
  const a = E.audit(t);
  const p = a.issues.find((i) => i.cat === 'participation');
  assert.equal(E.applyAnswer(t, p, { kind: 'delete' }).text, '성실한 태도를 보임.');
});

test('평가어를 지우면 매달린 수식어도 함께 정리된다', () => {
  const t = '대학 수준의 탁월한 역사 인식을 보여줌. 임진왜란 수업에 성실하게 참여함.';
  const a = E.audit(t);
  const ev = a.issues.find((i) => i.type === 'evidence' && i.cat === 'thinking');
  assert.equal(E.applyAnswer(t, ev, { kind: 'delete' }).text, '임진왜란 수업에 성실하게 참여함.');
  const p = a.issues.find((i) => i.cat === 'participation');
  assert.equal(E.applyAnswer(t, p, { kind: 'delete' }).text, '대학 수준의 탁월한 역사 인식을 보여줌.');
});

test('여러 응답 한꺼번에 적용: 금지 문구 삭제 + 강조어 삭제 + 근거 추가', () => {
  const st = demo.classDemo.students.find((s) => s.id === '20313');
  const a = E.audit(st.text);
  const items = E.topQuestions(a).map(({ issue, question }) => ({
    issue,
    answer: question.mode === 'choice' ? question.choices[0].answer : { kind: 'facts', facts: ['자료를 근거로 자신의 판단을 제시함'], keepEval: question.canKeepEval },
  }));
  const r = E.applyAnswers(st.text, items);
  assert.doesNotMatch(r.text, /대회|수상|대학 수준|의\./);
  assert.match(r.text, /^자료를 근거로 자신의 판단을 제시하는 등 역사 인식을 보여줌\./);
  assert.ok(E.guard(st.text, r.text, r.facts).ok);
});

test('사실 가드: 원문·확인 사실에 없는 표현을 잡는다', () => {
  const g = E.guard(demo.single.text, '안중근 의사의 재판 과정을 탐구하고 이토 히로부미 저격의 정당성을 논증함.', []);
  assert.equal(g.ok, false);
  assert.ok(g.novel.includes('히로부미'));
  const ok = E.guard(demo.single.text, '안중근 의사의 재판 과정을 탐구하고 두 주장을 비교함.', ['두 주장을 비교함']);
  assert.ok(ok.ok, ok.novel.join(','));
});

test('교사가 유지로 판단한 이슈는 재감사에서 제외된다', () => {
  const a = E.audit(demo.single.text);
  const v = a.issues.find((i) => i.type === 'vague');
  const b = E.audit(demo.single.text, { dismissed: new Set([v.signature]) });
  assert.ok(!b.issues.some((i) => i.signature === v.signature));
});

test('학급 감사: 반복 패턴·유사 쌍·상투어 빈도', () => {
  const c = E.classAudit(demo.classDemo.students);
  assert.equal(c.stats.students, 30);
  assert.ok(c.patterns[0].ids.length >= 10, '템플릿 11명 묶음');
  assert.match(c.patterns[0].template, /관심/);
  assert.ok(c.pairs.length > 0);
  assert.equal(c.topCliches[0][1], 11);
  const good = c.results.find((r) => r.id === '20302');
  const templ = c.results.find((r) => r.id === '20301');
  assert.ok(good.audit.overall > templ.audit.overall + 25);
});

test('딱 3가지만 묻기: 수정 효과 큰 순서', () => {
  const a = E.audit(demo.classDemo.students[0].text);
  const qs = E.topQuestions(a);
  assert.ok(qs.length <= 3 && qs.length > 0);
  for (let i = 1; i < qs.length; i++) assert.ok(qs[i - 1].issue.gain >= qs[i].issue.gain);
  assert.ok(E.expectedScore(a, qs.map((q) => q.issue)) > a.overall);
});

/* ── 2026 기재요령 위험/주의 등급 ── */

test('위험(기재 금지)이 있으면 점수와 무관하게 입력 불가', () => {
  const a = E.audit('TOEIC 900점을 취득하고 서울대학교 영어 말하기 대회에서 금상을 수상함. 영어 발표에서 청중에 맞춰 예시를 바꿈.');
  const v = E.verdict(a);
  assert.equal(v.stamp, '위험');
  const titles = a.danger.flatMap((i) => i.titles);
  ['공인어학시험', '대회', '대학명'].forEach((t) => assert.ok(titles.includes(t), t));
  assert.ok(a.danger.every((i) => i.ref));
});

test('상호명·기관명은 대체어로 바꾸고 조사도 맞춘다', () => {
  const t = '구글을 활용하여 자료를 찾고 한국정보화진흥원 자료를 근거로 설명함.';
  let a = E.audit(t);
  let text = t;
  for (const i of a.danger) text = E.applyAnswer(text, i, { kind: 'replace' }).text;
  assert.equal(text, '포털사이트를 활용하여 자료를 찾고 관련 연구기관 자료를 근거로 설명함.');
  assert.equal(E.audit(text).danger.length, 0);
});

test('대회를 행사로 바꾼 우회 기재를 잡는다', () => {
  const a = E.audit('교내 과학 창의 행사에서 참가자 중 1위로 선정됨.');
  assert.ok(a.danger.some((i) => i.titles.includes('대회 우회 기재 의심')));
});

test('교과 내용 속 낱말은 금지로 잡지 않는다 (오탐 방지)', () => {
  ['함수의 대상을 정의역의 원소로 정하고 대응 관계를 설명함.',
    '독립 협회의 만민 공동회 활동을 조사하고 신민회와 목표를 비교함.',
    '이순신 동상 사진 자료를 분석함.',
    '『코스모스』를 읽고 우주의 나이를 추정하는 방법을 설명함.',
    '교육청 주관 탐구 발표회에 참여하여 조사 결과를 설명함.',
  ].forEach((t) => assert.equal(E.audit(t).danger.length, 0, t));
});

test('학교명·강사명·방과후학교·분량 초과는 위험', () => {
  const a = E.audit('한빛고등학교 축제에서 김민수 교수의 특강을 들음. 방과후 수업에서 실험함.');
  const titles = a.danger.flatMap((i) => i.titles);
  ['학교를 알 수 있는 내용', '강사명', '방과후학교'].forEach((t) => assert.ok(titles.includes(t), t));
  const long = E.audit('이차함수의 꼭짓점을 완전제곱식으로 구함. '.repeat(40));
  assert.ok(long.danger.some((i) => i.type === 'overflow'));
});

test('주의: 지식 단순 서술·학생 소감 어투·활동 나열', () => {
  assert.ok(E.audit('대동법은 공납을 쌀이나 베 또는 돈으로 납부하게 한 제도임.').caution.some((i) => i.type === 'knowledge'));
  assert.ok(E.audit('앞으로 다른 사람의 입장을 존중하는 사람이 되고 싶음.').caution.some((i) => i.type === 'selfvoice'));
  assert.ok(E.audit('지문을 읽고 낱말을 정리함. 중심 문장을 찾아 기록함. 발표 자료를 제작하고 발표함.').caution.some((i) => i.type === 'listing'));
  const good = E.audit('유리함수의 그래프에서 x=2를 제외해야 하는 이유를 분모가 0이 되는 조건으로 설명함. 약분 전 정의역이 유지됨을 x=1이라는 반례로 검증함.');
  assert.equal(good.issues.length, 0);
  assert.equal(E.verdict(good).stamp, '양호');
});

test('주의 이슈를 유지해도 점수는 오르지 않는다 (검토 상태 ≠ 품질)', () => {
  const t = '수업에 적극적으로 참여함. 뛰어난 탐구역량을 보임.';
  const a = E.audit(t);
  const b = E.audit(t, { dismissed: new Set(a.issues.map((i) => i.signature)) });
  assert.equal(b.issues.length, 0);
  assert.equal(b.overall, a.overall);
});

test('소수점에서 문장을 자르지 않고, 명사형 활용을 바르게 만든다', () => {
  assert.equal(ko.splitSentences('농도를 0.5%에서 1.0%로 높임. 비교함.').length, 2);
  assert.equal(ko.asRecordSentence('짝과 의견을 나누었다'), '짝과 의견을 나눔.');
  assert.equal(ko.asRecordSentence('오차의 원인을 알았다'), '오차의 원인을 앎.');
  assert.equal(ko.asRecordSentence('그래프를 그렸다'), '그래프를 그림.');
});

test('사실 가드: 바뀐 수치와 뒤집힌 부정 표현을 잡는다', () => {
  assert.ok(!E.guard('실험을 3 회 수행함.', '실험을 9 회 수행함.', []).ok);
  assert.ok(!E.guard('원리를 설명하지 못함.', '원리를 설명함.', []).ok);
  assert.ok(E.guard('원리를 설명함.', '원리를 설명함.', []).ok);
});

test('처방 후보는 빈칸을 채워야 하는 관찰 항목이다 (획일화 방지)', () => {
  const a = E.audit('수학 수업에서 문제해결력이 돋보임.');
  const q = E.topQuestions(a)[0].question;
  assert.ok(q.candidates.every((c) => /〔[^〕]*〕/.test(c)));
});

test('기재 금지는 유지(통과)로 넘길 수 없다', () => {
  const t = '교내 역사토론대회에서 최우수상을 수상함. 구글에서 자료를 찾음.';
  const a = E.audit(t);
  assert.ok(a.danger.length >= 2);
  a.danger.forEach((i) => {
    const q = E.buildQuestion(i, a);
    assert.ok(!q.choices.some((c) => c.answer.kind === 'keep'), '유지 선택지가 있으면 안 됨: ' + i.titles);
    assert.ok(q.choices.every((c) => ['delete', 'replace'].includes(c.answer.kind)));
  });
  // 위험을 '유지'로 지우려 해도 판정은 위험으로 남는다
  const kept = E.audit(t, { dismissed: new Set(a.danger.map((i) => i.signature)) });
  assert.equal(E.verdict(kept).stamp, '위험');
  const verified = E.audit(t, { verified: new Set(a.danger.map((i) => i.signature)) });
  assert.equal(E.verdict(verified).stamp, '위험');
});
