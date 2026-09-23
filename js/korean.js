/* 한국어 처리 유틸 — 받침 판정, 조사 선택, 명사형 종결/연결형 변환, 나이스 바이트 계산 */
(function (root) {
  const SA = (root.SA = root.SA || {});

  const HANGUL_BASE = 0xac00;
  const HANGUL_END = 0xd7a3;
  const JONG_M = 16; // ㅁ
  const JONG_L = 8; // ㄹ
  const JONG_LM = 10; // ㄻ

  function isHangul(ch) {
    if (!ch) return false;
    const c = ch.charCodeAt(0);
    return c >= HANGUL_BASE && c <= HANGUL_END;
  }

  function jongIndex(ch) {
    if (!isHangul(ch)) return -1;
    return (ch.charCodeAt(0) - HANGUL_BASE) % 28;
  }

  function withJong(ch, jong) {
    const c = ch.charCodeAt(0) - HANGUL_BASE;
    return String.fromCharCode(HANGUL_BASE + c - (c % 28) + jong);
  }

  function lastHangul(word) {
    for (let i = word.length - 1; i >= 0; i--) {
      if (isHangul(word[i])) return word[i];
      if (/[0-9A-Za-z]/.test(word[i])) return word[i];
    }
    return '';
  }

  /** 받침이 있는가 (숫자·영문은 읽는 소리 기준으로 대략 판정) */
  function hasBatchim(word) {
    const ch = lastHangul(String(word).replace(/[\s'"’”」』)\]]+$/, ''));
    if (!ch) return false;
    if (/[0-9]/.test(ch)) return '013678'.includes(ch);
    if (/[A-Za-z]/.test(ch)) return /[lmnr]/i.test(ch);
    return jongIndex(ch) > 0;
  }

  /** 조사 고르기: josa(word, '을/를') */
  function josa(word, pair) {
    const [a, b] = pair.split('/');
    if (pair === '으로/로') {
      const ch = lastHangul(word);
      const j = jongIndex(ch);
      return word + (j <= 0 || j === JONG_L ? '로' : '으로');
    }
    return word + (hasBatchim(word) ? a : b);
  }

  /** 용언 어간 → 명사형 종결 (하 → 함, 보이 → 보임, 읽 → 읽음, 만들 → 만듦) */
  function nominalizeStem(stem) {
    stem = stem.replace(/\s+$/, '');
    if (!stem) return stem;
    const last = stem[stem.length - 1];
    if (!isHangul(last)) return stem + '함';
    const j = jongIndex(last);
    if (j === 0) return stem.slice(0, -1) + withJong(last, JONG_M);
    if (j === JONG_L) return stem.slice(0, -1) + withJong(last, JONG_LM);
    return stem + '음';
  }

  /** 명사형 종결 어절인가 (함, 보임, 읽음, 됨 …) */
  function isNominalEnding(word) {
    const w = String(word).replace(/[.\s]+$/, '');
    const ch = w[w.length - 1];
    if (!isHangul(ch)) return false;
    const j = jongIndex(ch);
    return j === JONG_M || j === JONG_LM;
  }

  /** 명사형 종결 어절 → 어간 (함 → 하, 보임 → 보이, 읽음 → 읽) */
  function stemFromNominal(word) {
    const w = String(word).replace(/[.\s]+$/, '');
    if (w.endsWith('음') && w.length >= 2 && jongIndex(w[w.length - 2]) > 0) return w.slice(0, -1);
    const ch = w[w.length - 1];
    const j = jongIndex(ch);
    if (j === JONG_M) return w.slice(0, -1) + withJong(ch, 0);
    if (j === JONG_LM) return w.slice(0, -1) + withJong(ch, JONG_L);
    return null;
  }

  // 연결 어미 → 어간 추출 규칙 (긴 것부터)
  const CONNECTIVE_RULES = [
    [/하였으며$/, '하'], [/했으며$/, '하'], [/하였고$/, '하'], [/했고$/, '하'],
    [/하는 등$/, '하'], [/하면서$/, '하'], [/하며$/, '하'], [/하여$/, '하'], [/해서$/, '하'],
    [/하고$/, '하'], [/하는데$/, '하'], [/해$/, '하'],
    [/는 등$/, ''], [/은 등$/, ''], [/면서$/, ''], [/으며$/, ''], [/며$/, ''], [/고$/, ''],
  ];

  /**
   * 문장 앞부분(연결 어미로 끝남)을 명사형 종결 문장으로 닫는다.
   * "재판의 부당성을 파악하는 등" → "재판의 부당성을 파악함."
   */
  function closeClause(prefix) {
    let p = String(prefix).replace(/[\s,]+$/, '');
    if (!p) return '';
    if (isNominalEnding(p)) return p + '.';
    for (const [re, stemTail] of CONNECTIVE_RULES) {
      if (re.test(p)) {
        const body = p.replace(re, '');
        if (stemTail === '하') return body + '함.';
        // "읽는 등" → "읽" / "보이며" → "보이"
        if (!body) break;
        return nominalizeStem(body) + '.';
      }
    }
    return p.replace(/[.]*$/, '') + '.';
  }

  /** 명사형 종결 문장 → 연결형 ("…비교함." → "…비교하고") */
  function toConnective(sentence) {
    const s = String(sentence).replace(/[.\s]+$/, '');
    const m = s.match(/(\S+)$/);
    if (!m) return s;
    const stem = stemFromNominal(m[1]);
    if (stem == null) return s + '하고';
    return s.slice(0, s.length - m[1].length) + stem + '고';
  }

  /** 명사형 종결 문장 → "…하는 등" */
  function toDeung(sentence) {
    const s = String(sentence).replace(/[.\s]+$/, '');
    const m = s.match(/(\S+)$/);
    if (!m) return s;
    const stem = stemFromNominal(m[1]);
    if (stem == null) return s + ' 등';
    const lastCh = stem[stem.length - 1];
    let conj = stem + '는';
    if (jongIndex(lastCh) === JONG_L) conj = stem.slice(0, -1) + withJong(lastCh, 0) + '는';
    return s.slice(0, s.length - m[1].length) + conj + ' 등';
  }

  const JUNG_UNCONTRACT = { 6: 20, 14: 13, 9: 8, 10: 11 }; // ㅕ→ㅣ(그렸→그리), ㅝ→ㅜ(줬→주), ㅘ→ㅗ(봤→보), ㅙ→ㅚ(됐→되)

  /** 과거·현재 평서형 어절 → 어간 ("나누었다"→"나누", "그렸다"→"그리", "읽는다"→"읽"). 모르면 null */
  function stemFromPredicate(w) {
    let m;
    if ((m = w.match(/^(.*)(?:었|았)(?:다|음)$/)) && m[1]) return m[1];
    if ((m = w.match(/^(.*)는다$/)) && m[1]) return m[1];
    const body = w.replace(/(?:다|음)$/, '');
    if (body === w || !body) return null;
    const last = body[body.length - 1];
    if (!isHangul(last)) return null;
    const c = last.charCodeAt(0) - HANGUL_BASE;
    const jong = c % 28;
    const jung = Math.floor(c / 28) % 21;
    const cho = Math.floor(c / 588);
    if (jong === 20) { // ㅆ: 축약된 과거형
      const nj = JUNG_UNCONTRACT[jung] != null ? JUNG_UNCONTRACT[jung] : jung;
      return body.slice(0, -1) + String.fromCharCode(HANGUL_BASE + cho * 588 + nj * 28);
    }
    if (jong === 4 && /다$/.test(w)) return body.slice(0, -1) + withJong(last, 0); // ㄴ다: 그린다→그리
    return null;
  }

  /** 사실 한 줄을 명사형 종결 문장으로 정돈 (끝에 마침표) */
  function asRecordSentence(fact) {
    let f = String(fact).trim().replace(/[.。]+$/, '');
    if (!f) return '';
    const last = f.split(/\s+/).pop();
    if (isNominalEnding(last) && !/(?:었|았|였|했)음$/.test(last)) return f + '.';
    f = f.replace(/(?:하였다|했다|한다|하였음|했음)$/, '함')
      .replace(/(할|될|볼|알)\s*수\s*있다$/, '$1 수 있음')
      .replace(/(있|없)다$/, '$1음')
      .replace(/(?:이었다|였다|이다)$/, (x) => (x === '이다' ? '임' : '이었음'));
    const w = f.split(/\s+/).pop();
    if (isNominalEnding(w) && !/(?:었|았)음$/.test(w)) return f + '.';
    const stem = stemFromPredicate(w);
    if (stem) return f.slice(0, f.length - w.length) + nominalizeStem(stem) + '.';
    return closeClause(f);
  }

  /** 여러 사실을 한 문장으로 잇기 */
  function joinFacts(facts) {
    const list = facts.map(asRecordSentence).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).map(toConnective).join(' ') + ' ' + list[list.length - 1];
  }

  /** 나이스 바이트: 한글·전각 3, ASCII 1, 개행 1 (기재요령 2026 참고자료8) */
  function neisBytes(text) {
    const t = String(text).replace(/\r\n/g, '\n');
    let n = 0;
    for (const ch of t) n += ch.charCodeAt(0) < 128 ? 1 : 3;
    return n;
  }

  /** 문장 분리 — 오프셋 보존 */
  function splitSentences(text) {
    const out = [];
    const re = /[^.!?\n]+(?:[.!?]+|\n|$)/g;
    // 소수점(0.5)·버전 번호는 문장 끝이 아니다 — 같은 길이의 문자로 가려 두고 오프셋은 원문 그대로 쓴다
    const masked = String(text).replace(/(\d)\.(?=\d)/g, '$1․');
    let m;
    while ((m = re.exec(masked))) {
      const raw = m[0];
      if (!raw.trim()) continue;
      const lead = raw.length - raw.trimStart().length;
      const start = m.index + lead;
      const end = start + raw.trim().length;
      out.push({ text: String(text).slice(start, end), start, end });
    }
    return out;
  }

  const PARTICLES = [
    '으로부터', '에서부터', '으로서', '으로써', '에게서', '이라는', '라는', '이라고', '라고',
    '에서는', '에서도', '에서의', '으로의', '에게', '한테', '께서', '에서', '으로', '까지', '부터',
    '처럼', '보다', '마다', '조차', '에는', '에도', '과의', '와의', '이나', '이며',
    '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '나',
  ];
  const VERB_ENDINGS = [
    '하였으며', '하였는데', '하였고', '했으며', '하면서', '하는 등', '하였음', '하였다', '하여',
    '하며', '하고', '하는', '하던', '했고', '했다', '해서', '한다', '함', '한', '할', '해',
    '되었으며', '되었고', '되어', '되며', '되고', '되는', '됨', '된', '적인', '적으로', '적',
  ];

  /** 어절 → 비교용 어간 변형들 */
  function stemVariants(word) {
    let w = String(word).replace(/[^가-힣A-Za-z0-9]/g, '');
    if (!w) return [];
    const set = new Set([w]);
    for (const p of PARTICLES) {
      if (w.length > p.length + 1 && w.endsWith(p)) { w = w.slice(0, -p.length); set.add(w); break; }
    }
    for (const e of VERB_ENDINGS) {
      const e2 = e.replace(/\s/g, '');
      if (w.length > e2.length && w.endsWith(e2)) { set.add(w.slice(0, -e2.length)); break; }
    }
    const nomStem = stemFromNominal(w);
    if (nomStem) set.add(nomStem);
    // 연결형 "보이고"/"읽고" → "보이"/"읽"
    if (/[가-힣]고$/.test(w) && w.length >= 3) set.add(w.slice(0, -1));
    if (/[가-힣]며$/.test(w) && w.length >= 3) set.add(w.slice(0, -1));
    return [...set].filter((v) => v.length >= 1);
  }

  /** 핵심 어간 하나 (조사·어미 제거) */
  function coreStem(word) {
    const v = stemVariants(word);
    return v.reduce((a, b) => (b.length < a.length && b.length >= 2 ? b : a), v[0] || '');
  }

  SA.ko = {
    isHangul, jongIndex, hasBatchim, josa, nominalizeStem, isNominalEnding, stemFromNominal,
    closeClause, toConnective, toDeung, asRecordSentence, joinFacts, neisBytes, splitSentences,
    stemVariants, coreStem,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.ko;
})(typeof globalThis !== 'undefined' ? globalThis : window);
