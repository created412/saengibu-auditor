// 실제 세특 말뭉치 회귀 — 이 세션에서 선생님이 넣어 본 실제 문장들. 판정이 뒤로 가지 않게 못 박는다.
// 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

['korean', 'lexicon', 'engine'].forEach((f) => require(path.join(__dirname, '..', 'js', `${f}.js`)));
const E = globalThis.SA.engine;

const titles = (a) => a.danger.flatMap((i) => i.titles);
const types = (a) => a.caution.map((i) => i.type);

test('서울대 합격 사례 발췌 — 위험 0, 90점 이상', () => {
  const snu = [
    '통계지도와 신문기사를 활용하여 외국인 주민의 지역별 분포와 다문화 수용성 문제를 탐구함. 지역별 외국인 주민 밀집도가 사회적 갈등과 문화적 융합에 미치는 영향을 자료를 바탕으로 분석하고, 미디어 보도가 외국인 주민에 대한 인식을 형성하는 과정도 함께 살펴봄. 이를 토대로 지역사회 내 다문화 교육과 주민 간 접촉 기회를 확대하는 방안을 제시함. “지리학자의 인문여행(이영민)”을 읽고 장소와 문화적 맥락의 관계, 여행에서 만나는 전이적 장소와 경계의 의미를 탐구함. 또한 직접 답사한 순천만 갯벌의 형성과 생태적 가치를 조사하고 습지가 기후변화 완화와 생물다양성 유지에 미치는 영향을 분석함.',
    '농구 영화를 본 뒤 자유투의 포물선에 관심을 갖고 이차함수와 연결하여 탐구함. 자유투를 던지는 장면을 캡처해 공의 이동 경로를 이차함수 그래프에 나타냄. 골대 높이와 거리를 직접 측정하여 이차함수의 식을 구하고 최고점의 높이를 계산함. 처음에는 각도만 중요하다고 보았으나, 측정값을 다시 비교한 뒤 초기 속도와 각도가 함께 작용한다고 정리함.',
  ];
  snu.forEach((t) => {
    const a = E.audit(t);
    assert.equal(a.danger.length, 0, titles(a).join(','));
    assert.ok(a.overall >= 90, `점수 ${a.overall}`);
  });
});

test('생성형 AI로 만든 형식적 세특 — 대회·대학명·허위 비약을 잡는다', () => {
  const t = '수업시간에 항상 맨 앞자리에 앉아 선생님의 설명을 집중해서 듣는 학생임. 수학 공식을 암기하는 능력이 뛰어나며 계산 실수가 적음. 피타고라스의 정리를 배우면서 미적분의 기초 원리를 스스로 깨우치고 이를 실생활에 적용하려는 탐구정신을 보여주었음. 모르는 문제가 생기면 쉬는시간에 교무실로 찾아와 질문을 하는 등 학업에 대한 열정이 남다름. 수학 성적이 아주 높은 편은 아니지만 포기하지안고 꾸준히 노력하는 모습이 매우 보기 좋음.';
  const a = E.audit(t);
  assert.ok(titles(a).includes('성적·석차 언급'));
  assert.ok(titles(a).includes('맞춤법·어휘 오류'));
  assert.ok(types(a).includes('leap'), '개념 비약');
  assert.ok(types(a).includes('evidence'), '능력이 뛰어나며');
  assert.ok(a.overall < 85, `점수 ${a.overall}`);
});

test('진로·행특 — 검사 결과·미래 예측·인성 단정·오타', () => {
  const jinro = E.audit('평소 자신의 진로에 대해 고민하는 모습이 인상적인 학생임. 학교에서 실시한 직업 체험 활동에 참여하여 경찰관이라는 직업에 대해 깊히 이해하는 시간을 가짐. 하지만 이후 실시한 홀랜드 직업적성검사에서는 예술형(A)이 높게 나와 미술 분야에도 관심이 많다는 것을 알게 됨. 여러 방면으로 호기심이 많고 진로를 탐색하려는 의지가 돋보여 앞으로 훌륭한 인제가 될 것으로 기대됨.');
  assert.ok(titles(jinro).includes('심리·적성검사 결과'));
  assert.ok(titles(jinro).includes('맞춤법·어휘 오류'));
  assert.ok(types(jinro).includes('future'));
  const haeng = E.audit('밝고 긍정적인 성격으로 친구들과 두루두루 잘 어울리며 학급 분위기를 좋게 만드는 학생임. 청소 시간에 남들이 하기 싫어하는 궃은 일을 도맡아 하는 등 봉사정신이 투철함. 비록 학급 임원을 하지는 않았지만 뒤에서 친구들을 묵묵히 챙겨주는 숨은 리더쉽을 발휘함. 매사에 성실하고 착해서 앞으로 어떤 일을 하든지 잘 해낼 수 있을 것이라 생각함.');
  assert.ok(types(haeng).includes('personality'));
  assert.ok(types(haeng).includes('future'));
  assert.equal(haeng.danger.filter((i) => i.titles.includes('맞춤법·어휘 오류')).length, 2, '궃은·리더쉽');
});

test('상호명 — 토스(금융)·KBS 프로그램 제목·인증시험', () => {
  const toss = E.audit('토스 앱으로 송금 과정을 살펴보고 수수료 구조를 비교함.');
  assert.ok(titles(toss).includes('상호명'));
  const kbs = E.audit("주말에 'KBS 역사저널 그날'을 시청하고 조선시대 왕들의 삶에 대해 깊이 탐구함. 특히 개인적으로 공부하여 교외 한국사능력검정시험 1급을 취득할 정도로 역사적 지식이 해박함.");
  assert.ok(titles(kbs).includes('인증시험'));
  assert.ok(!kbs.caution.some((i) => i.type === 'brandish'), '따옴표 안 프로그램 제목은 의심하지 않는다');
});

test('접하기만 한 절은 역량의 근거가 아니다', () => {
  const a = E.audit('안중근 관련 자료를 읽고 탁월한 역사적 사고력을 보여줌.');
  assert.ok(a.caution.some((i) => i.type === 'evidence'), '‘자료를 읽고’만으로 근거 인정됨');
  const b = E.audit('안중근 재판 기록에서 관할권 논리를 찾아 일본 측 주장과 비교하는 등 뛰어난 역사적 사고력을 보여줌.');
  assert.ok(!b.caution.some((i) => i.type === 'evidence'), '실제 사고 행위가 있으면 근거로 인정');
});
