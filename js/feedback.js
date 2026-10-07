/* 선생님 한 줄 피드백 — 서버도, API 키도 쓰지 않는다.
 *
 * 보내는 방법은 아래 FEEDBACK에서 고른다(위에서부터 먼저 설정된 것을 쓴다).
 *   form   : 구글 폼 등 설문 주소. 'entry.숫자' 항목 id까지 적으면 글이 미리 채워진다.
 *            예) { url: 'https://docs.google.com/forms/d/e/XXX/viewform', text: 'entry.123456', tone: 'entry.654321' }
 *   mailto : 받을 메일 주소. 메일 앱이 제목·본문이 채워진 채로 열린다.
 *   github : 공개 저장소(소유자/이름). 깃허브 이슈 작성 창이 채워진 채로 열린다(깃허브 계정 필요).
 *
 * 어느 쪽이든 '열어 주기'만 한다. 실제 전송은 선생님이 내용을 보고 직접 누른다.
 * 적은 글은 이 브라우저에도 남겨 두어(최근 20줄) 창을 닫아도 잃지 않는다.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});

  const FEEDBACK = {
    form: null,
    mailto: null,
    github: 'created412/saengibu-auditor',
  };

  const KEY = 'sa.feedback.v1';
  const TONE_LABEL = { good: '도움이 됐어요', soso: '쓸 만해요', bad: '아쉬워요' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-20))); } catch (e) { /* 저장 못 해도 보내기는 된다 */ }
  }

  function add(entry) {
    const list = load();
    list.push(entry);
    save(list);
    return list;
  }

  /** 보낼 주소를 만든다 (열기만 하고, 전송은 교사가 직접) */
  function sendUrl({ text, tone }) {
    const label = TONE_LABEL[tone] || '';
    const body = `${text}${label ? `\n\n느낌: ${label}` : ''}\n\n— 생기부 감사관 피드백`;
    if (FEEDBACK.form && FEEDBACK.form.url) {
      const u = new URL(FEEDBACK.form.url);
      u.searchParams.set('usp', 'pp_url');
      if (FEEDBACK.form.text) u.searchParams.set(FEEDBACK.form.text, text);
      if (FEEDBACK.form.tone && label) u.searchParams.set(FEEDBACK.form.tone, label);
      return { url: u.toString(), kind: 'form' };
    }
    if (FEEDBACK.mailto) {
      return {
        url: `mailto:${FEEDBACK.mailto}?subject=${encodeURIComponent('[생기부 감사관] 한 줄 피드백')}&body=${encodeURIComponent(body)}`,
        kind: 'mailto',
      };
    }
    if (FEEDBACK.github) {
      const title = text.length > 50 ? `${text.slice(0, 50)}…` : text;
      return {
        url: `https://github.com/${FEEDBACK.github}/issues/new?title=${encodeURIComponent(`[피드백] ${title}`)}&body=${encodeURIComponent(body)}`,
        kind: 'github',
      };
    }
    return null;
  }

  SA.feedback = { FEEDBACK, TONE_LABEL, load, add, sendUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.feedback;
})(typeof globalThis !== 'undefined' ? globalThis : window);
