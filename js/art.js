/* 표지 오마주 일러스트 — 펼친 책 위의 학교와 둘레의 교과 아이콘을 선화(line art)로 그린다. 외부 파일 없이 SVG 문자열만 쓴다. */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const INK = '#3b3c42';
  const BLUE = '#7d9fd8';
  const BLUE_L = '#bcd0ef';
  const PAPER = '#ffffff';
  const GREY = '#eceff4';
  const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  const thin = `stroke="#8d93a3" stroke-width="1.6" stroke-linecap="round"`;

  const plus = (x, y, r = 8) => `<path d="M${x - r} ${y}h${2 * r}M${x} ${y - r}v${2 * r}" ${S} stroke-width="2.4"/>`;
  const ring = (x, y, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" ${S} stroke-width="2.2"/>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${INK}"/>`;
  const burst = (x, y, r = 11) => {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = (Math.PI * 2 * k) / 10;
      const r1 = r * 0.45;
      d += `M${(x + Math.cos(a) * r1).toFixed(1)} ${(y + Math.sin(a) * r1).toFixed(1)}L${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`;
    }
    return `<path d="${d}" ${S} stroke-width="1.8"/>`;
  };
  const star = (x, y, r = 7) => `<path d="M${x - r} ${y}L${x + r} ${y}M${x} ${y - r}L${x} ${y + r}M${x - r * 0.7} ${y - r * 0.7}L${x + r * 0.7} ${y + r * 0.7}M${x + r * 0.7} ${y - r * 0.7}L${x - r * 0.7} ${y + r * 0.7}" ${S} stroke-width="1.6"/>`;
  const dash = (x, y, w) => `<path d="M${x} ${y}h${w * 0.78}M${x + w * 0.86} ${y}h${w * 0.14}" ${thin}/>`;

  function cover() {
    const parts = [];
    // 배경 장식: 가는 대시선
    [[70, 60, 110], [520, 40, 90], [640, 110, 120], [40, 180, 100], [680, 260, 90], [30, 400, 110], [690, 420, 80], [120, 480, 90], [560, 470, 120], [330, 20, 70]]
      .forEach(([x, y, w]) => parts.push(dash(x, y, w)));

    // 연결선 (실선·점선)
    parts.push(`<path d="M210 142 L330 214" ${S} stroke-width="2.4"/>`);
    parts.push(`<path d="M232 250 H330" ${S} stroke-width="2.4" stroke-dasharray="9 8"/>`);
    parts.push(`<path d="M188 318 H330" ${S} stroke-width="2.4"/>`);
    parts.push(`<path d="M206 420 L330 336" ${S} stroke-width="2.4" stroke-dasharray="9 8"/>`);
    parts.push(`<path d="M470 214 L560 110" ${S} stroke-width="2.4" stroke-dasharray="9 8"/>`);
    parts.push(`<path d="M470 236 H566" ${S} stroke-width="2.4"/>`);
    parts.push(`<path d="M470 306 H626" ${S} stroke-width="2.4" stroke-dasharray="9 8"/>`);
    parts.push(`<path d="M470 350 L630 420" ${S} stroke-width="2.4"/>`);

    // 펼친 책 받침
    parts.push(`<path d="M232 430 Q300 408 400 432 Q500 408 568 430 L574 452 Q500 432 400 458 Q300 432 226 452 Z" fill="${BLUE}" ${S}/>`);
    parts.push(`<path d="M246 414 Q310 396 400 418 Q490 396 554 414 L560 432 Q490 414 400 438 Q310 414 240 432 Z" fill="${GREY}" ${S}/>`);
    parts.push(`<path d="M400 418 V438" ${S}/>`);
    // 계단
    parts.push(`<rect x="262" y="396" width="276" height="20" fill="${PAPER}" ${S}/>`);
    parts.push(`<rect x="282" y="378" width="236" height="20" fill="${PAPER}" ${S}/>`);

    // 양옆 탑
    parts.push(`<rect x="306" y="226" width="58" height="152" fill="${PAPER}" ${S}/>`);
    parts.push(`<rect x="436" y="226" width="58" height="152" fill="${PAPER}" ${S}/>`);
    parts.push(`<rect x="302" y="216" width="66" height="14" fill="${BLUE}" ${S}/>`);
    parts.push(`<rect x="432" y="216" width="66" height="14" fill="${BLUE}" ${S}/>`);
    parts.push(`<rect x="322" y="248" width="24" height="108" rx="3" fill="${GREY}" ${S}/>`);
    parts.push(`<rect x="454" y="248" width="24" height="108" rx="3" fill="${GREY}" ${S}/>`);
    // 깃발
    parts.push(`<path d="M334 216 V168" ${S}/><path d="M334 170 L372 182 L334 196 Z" fill="${PAPER}" ${S}/>`);
    parts.push(`<path d="M466 216 V168" ${S}/><path d="M466 170 L504 182 L466 196 Z" fill="${PAPER}" ${S}/>`);

    // 본관 박공
    parts.push(`<path d="M360 378 V226 L400 196 L440 226 V378 Z" fill="${PAPER}" ${S}/>`);
    parts.push(`<path d="M352 232 L400 176 L448 232" fill="none" stroke="${BLUE}" stroke-width="9" stroke-linejoin="round"/>`);
    parts.push(`<path d="M348 236 L400 172 L452 236" fill="none" ${S}/>`);
    // 시계
    parts.push(`<circle cx="400" cy="232" r="19" fill="${BLUE}" ${S}/>`);
    parts.push(`<path d="M400 220 V233 L409 239" fill="none" ${S} stroke-width="2.6"/>`);
    // 창·현관
    parts.push(`<rect x="372" y="268" width="56" height="16" fill="${PAPER}" ${S}/>`);
    parts.push(`<rect x="372" y="294" width="56" height="16" fill="${PAPER}" ${S}/>`);
    parts.push(`<rect x="380" y="322" width="40" height="10" fill="${BLUE}" ${S}/>`);
    parts.push(`<rect x="386" y="332" width="28" height="46" fill="${PAPER}" ${S}/><path d="M400 332 V378" ${S}/>`);

    // ① 창 격자(시간표) 아이콘 — 왼쪽 위
    parts.push(`<rect x="150" y="96" width="62" height="50" fill="${PAPER}" ${S}/><rect x="142" y="88" width="62" height="50" fill="${BLUE_L}" ${S}/>`);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) parts.push(`<rect x="${148 + c * 14}" y="${94 + r * 14}" width="9" height="8" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`);
    // ② A+ 말풍선
    parts.push(`<path d="M232 250 a32 32 0 1 0 -18 28 l14 8 -3 -14 a32 32 0 0 0 7 -22z" fill="${PAPER}" ${S}/>`);
    parts.push(`<text x="186" y="264" font-family="'Black Han Sans','Malgun Gothic',sans-serif" font-size="34" fill="${BLUE}" stroke="${INK}" stroke-width="1.6">A</text>${plus(220, 240, 6)}`);
    // ③ 프로필 카드 + 말줄임 말풍선
    parts.push(`<rect x="126" y="296" width="56" height="46" rx="4" fill="${PAPER}" ${S}/><circle cx="154" cy="315" r="9" fill="${BLUE_L}" ${S} stroke-width="2.4"/><path d="M140 336 q14 -12 28 0" fill="none" ${S} stroke-width="2.4"/>`);
    parts.push(`<rect x="160" y="280" width="40" height="18" rx="9" fill="${PAPER}" ${S} stroke-width="2.4"/>${dot(172, 289)}${dot(180, 289)}${dot(188, 289)}`);
    // ④ 리본 배지
    parts.push(`<circle cx="190" cy="372" r="11" fill="${PAPER}" ${S} stroke-width="2.4"/><path d="M183 381 l-5 13 7 -3 3 7 4 -12 M197 381 l5 13 -7 -3 -3 7 -4 -12" fill="${PAPER}" ${S} stroke-width="2"/>`);
    // ⑤ 연필 묶음 원
    parts.push(`<circle cx="182" cy="436" r="34" fill="${PAPER}" ${S}/>`);
    parts.push(`<g transform="rotate(-32 182 436)">${[-13, 0, 13].map((o, k) => `<rect x="170" y="${431 + o}" width="34" height="10" rx="1.5" fill="${k === 1 ? BLUE_L : GREY}" ${S} stroke-width="2.2"/><path d="M170 ${431 + o} L158 ${436 + o} L170 ${441 + o} Z" fill="${PAPER}" ${S} stroke-width="2.2"/><path d="M158 ${436 + o} l4 -1.6 v3.2 z" fill="${INK}"/>`).join('')}</g>`);
    // ⑥ 축구공 말풍선
    parts.push(`<circle cx="586" cy="86" r="34" fill="${PAPER}" ${S}/><path d="M562 110 l-10 14 18 -8" fill="${PAPER}" ${S}/>`);
    parts.push(`<circle cx="586" cy="86" r="22" fill="${PAPER}" ${S} stroke-width="2.4"/><path d="M586 76 l9 7 -3 10 h-12 l-3 -10z" fill="${BLUE}" ${S} stroke-width="2"/><path d="M586 76 v-10 M595 83 l10 -4 M592 93 l6 9 M580 93 l-6 9 M577 83 l-10 -4" ${S} stroke-width="2"/>`);
    // ⑦ 계산기
    parts.push(`<rect x="566" y="206" width="62" height="60" rx="4" fill="${PAPER}" ${S}/>`);
    [[572, 212, '+'], [598, 212, '−'], [572, 238, '×'], [598, 238, '÷']].forEach(([x, y, t], k) => parts.push(`<rect x="${x}" y="${y}" width="22" height="22" rx="3" fill="${k === 2 ? BLUE_L : GREY}" ${S} stroke-width="2"/><text x="${x + 11}" y="${y + 17}" text-anchor="middle" font-size="17" font-weight="700" fill="${INK}" font-family="sans-serif">${t}</text>`));
    // ⑧ 헤드셋 인물
    parts.push(`<path d="M626 338 q0 -28 26 -28 q26 0 26 28 z" fill="${PAPER}" ${S}/><circle cx="652" cy="290" r="16" fill="${PAPER}" ${S}/><path d="M635 292 q0 -24 17 -24 q17 0 17 24" fill="none" ${S}/><rect x="630" y="286" width="8" height="14" rx="3" fill="${BLUE}" ${S} stroke-width="2"/><rect x="666" y="286" width="8" height="14" rx="3" fill="${BLUE}" ${S} stroke-width="2"/>`);
    parts.push(`<rect x="652" y="352" width="10" height="18" rx="5" fill="${INK}"/><path d="M646 364 q11 12 22 0 M657 376 v8 M650 384 h14" fill="none" ${S} stroke-width="2"/>`);
    // ⑨ BOOK
    parts.push(`<rect x="636" y="398" width="58" height="62" rx="4" fill="${GREY}" ${S}/><rect x="630" y="392" width="58" height="62" rx="4" fill="${PAPER}" ${S}/><rect x="630" y="424" width="58" height="10" fill="${BLUE_L}" ${S} stroke-width="2"/><rect x="630" y="392" width="10" height="62" fill="${GREY}" ${S} stroke-width="2"/>`);
    parts.push(`<text x="664" y="414" text-anchor="middle" font-size="11" font-family="sans-serif" fill="${INK}">BOOK</text>`);
    // 글자 장식
    parts.push(`<text x="382" y="148" font-size="24" font-family="'Black Han Sans','Malgun Gothic',sans-serif" fill="none" stroke="${INK}" stroke-width="1.6">ㄱㄴㄷ</text>`);
    parts.push(`<text x="386" y="494" font-size="22" font-family="sans-serif" font-weight="700" fill="none" stroke="${INK}" stroke-width="1.4">1234</text>`);

    // 흩어진 장식
    [[118, 202], [306, 132], [530, 150], [700, 190], [96, 380], [310, 480], [520, 360], [720, 380]].forEach(([x, y], k) => parts.push(k % 2 ? plus(x, y, 7) : plus(x, y, 9)));
    [[110, 160], [280, 112], [636, 152], [650, 178], [120, 426], [598, 470], [712, 474]].forEach(([x, y]) => parts.push(ring(x, y, k(x) ? 7 : 4.5)));
    [[232, 176], [520, 120], [656, 250], [258, 470], [610, 488]].forEach(([x, y]) => parts.push(dot(x, y)));
    [[262, 130], [286, 364], [540, 470], [540, 392]].forEach(([x, y]) => parts.push(burst(x, y, 12)));
    [[294, 142], [214, 472], [640, 336]].forEach(([x, y]) => parts.push(star(x, y, 6)));

    return `<svg class="cover-art" viewBox="40 20 720 490" role="img" aria-label="펼친 책 위의 학교 건물과 교과 아이콘 선화">${parts.join('')}</svg>`;
    function k(x) { return x % 3 === 0; }
  }

  /** 작은 학교 마크 (상단 로고) */
  function mark() {
    return `<svg viewBox="0 0 48 48" class="mark" aria-hidden="true"><path d="M8 40 V20 L24 8 L40 20 V40 Z" fill="${PAPER}" ${S}/><path d="M6 21 L24 7 L42 21" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="22" r="6" fill="${BLUE}" ${S} stroke-width="2.4"/><rect x="19" y="30" width="10" height="10" fill="${PAPER}" ${S} stroke-width="2.4"/><path d="M4 43 Q14 39 24 43 Q34 39 44 43" fill="none" ${S} stroke-width="2.6"/></svg>`;
  }

  SA.art = { cover, mark };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.art;
})(typeof globalThis !== 'undefined' ? globalThis : window);
