// 뜻의 어긋남(logic) — 역량 이름 ↔ 적힌 행동의 불일치 · 부정 뒤 긍정 모순 · 같은 대상의 수치 불일치
// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

['korean', 'lexicon', 'engine'].forEach((f) => require(path.join(__dirname, '..', 'js', `${f}.js`)));
const E = globalThis.SA.engine;

const logic = (t) => E.audit(t).caution.filter((i) => i.type === 'logic');

test('역량 이름과 적힌 행동이 어긋나면 잡고, 행동에 맞는 이름을 제안한다', () => {
  const t = '자유투 영상을 분석하여 이차함수의 식을 구하고 최고점을 계산하는 등 뛰어난 리더십을 보여줌.';
  const [i] = logic(t);
  assert.ok(i && i.kind === 'mismatch', '리더십 ↔ 식·계산');
  assert.equal(i.text, '리더십');
  assert.equal(i.replacement, '수학적 사고력');
  assert.equal(E.applyAnswer(t, i, { kind: 'replace' }).text,
    '자유투 영상을 분석하여 이차함수의 식을 구하고 최고점을 계산하는 등 뛰어난 수학적 사고력을 보여줌.');
  const a = E.audit(t);
  assert.ok(!a.caution.some((x) => x.type === 'evidence'), '같은 자리에 근거 부족을 겹쳐 잡지 않는다');
});

test('교과가 붙은 역량은 그 교과 내용이 있어야 한다', () => {
  assert.ok(logic('독서 토론에 참여하여 인물의 심리를 분석하며 과학적 탐구 능력을 기름.').length, '문학 활동 → 과학적 탐구');
  assert.ok(logic('현미경으로 세포를 관찰하고 결과를 기록하며 예술적 감수성을 보임.').length, '과학 활동 → 예술적 감수성');
  assert.ok(logic('친구들과 함께 실험을 하며 리더십을 보임.').length, '함께 함 ≠ 이끎');
  assert.equal(logic('친구들과 함께 실험을 하며 리더십을 보임.')[0].replacement, '협업 능력');
});

test('행동이 역량과 맞으면 잡지 않는다', () => {
  [
    '모둠 활동에서 의견을 조율하며 협업 능력을 보임.',
    '실험 결과를 분석하여 과학적 탐구 능력을 기름.',
    '소설 속 인물의 심리를 분석하여 문학적 감수성을 보임.',
    '토론에서 상대 의견을 경청하고 근거를 들어 반박하며 의사소통 능력을 보임.',
    '급우에게 풀이를 설명해 주며 배려하는 태도를 보임.',
    '모둠장을 맡아 역할을 나누고 발표를 진행하며 리더십을 발휘함.',
    '이차함수의 식을 구하고 최고점을 계산하는 등 수학적 문제 해결력을 보임.',
    '영어 원서를 읽고 주제를 요약하여 영어 의사소통 능력을 보임.',
    '새로운 포장 방법을 고안하여 모형을 제작하는 등 창의적 사고력을 보임.',
    '안중근 재판 기록에서 관할권 논리를 찾아 일본 측 주장과 비교하는 등 뛰어난 역사적 사고력을 보여줌.',
  ].forEach((t) => assert.equal(logic(t).length, 0, t));
});

test('근거 자체가 없는 문장은 논리 검사가 아니라 근거 부족이 맡는다', () => {
  const a = E.audit('안중근 관련 자료를 읽고 탁월한 역사적 사고력을 보여줌.');
  assert.ok(!a.caution.some((i) => i.type === 'logic'));
  assert.ok(a.caution.some((i) => i.type === 'evidence'));
});

test('부정한 역할이 뒤에서 되살아나면 모순 — 성장 서사는 예외', () => {
  const [i] = logic('비록 학급 임원을 하지는 않았지만 친구들을 묵묵히 챙김. 반장으로서 학급 행사를 이끎.');
  assert.ok(i && i.kind === 'contra');
  assert.equal(i.text, '반장으로서');
  assert.equal(logic('처음에는 발표를 하지 못했으나 이후 모둠 발표를 맡아 끝까지 해냄.').length, 0);
  assert.equal(logic('학급 임원을 맡지 않았지만 조장으로서 모둠을 이끎.').length, 0, '조장은 학급 임원이 아니다');
});

test('같은 대상의 수가 다르면 잡고, 앞의 수로 맞출 수 있다 — 다른 대상·기간은 예외', () => {
  const t = '탐구 보고서를 3편 작성함. 그중 보고서 2편을 발표함.';
  const [i] = logic(t);
  assert.ok(i && i.kind === 'count');
  assert.equal(i.text, '2편');
  assert.equal(E.applyAnswer(t, i, { kind: 'replace' }).text, '탐구 보고서를 3편 작성함. 그중 보고서 3편을 발표함.');
  assert.equal(logic('모둠 토의에 두 차례 참여함. 이후 모둠 토의 4회에 걸쳐 의견을 냄.')[0].text, '4회', '한글 수사도 수로 본다');
  assert.equal(logic('1학기 3회, 2학기 2회 모둠 발표를 함.').length, 0);
  assert.equal(logic('주 1회 독서 모임과 월 2회 토론 모임에 참여함.').length, 0);
});

test('처방 — 세 종류 모두 질문과 선택지가 있다', () => {
  for (const t of [
    '자유투 영상을 분석하여 이차함수의 식을 구하고 최고점을 계산하는 등 뛰어난 리더십을 보여줌.',
    '비록 학급 임원을 하지는 않았지만 친구들을 묵묵히 챙김. 반장으로서 학급 행사를 이끎.',
    '탐구 보고서를 3편 작성함. 그중 보고서 2편을 발표함.',
  ]) {
    const a = E.audit(t);
    const i = a.caution.find((x) => x.type === 'logic');
    const q = E.buildQuestion(i, a);
    assert.ok(q.prompt && q.choices.length >= 2, t);
    assert.ok(q.actions.includes('rewrite'), '어느 종류든 고쳐 쓰기로 손볼 수 있다');
  }
});
