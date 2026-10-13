/* Same-origin integration only. Student text never leaves the parent window. */
(function () {
  window.SA = window.SA || {};
  window.SA.initBridge = function ({ getText, audit, empty }) {
    if (new URLSearchParams(location.search).get('embedded') !== '1' || window.parent === window) return;

    document.documentElement.classList.add('embedded');
    const button = document.getElementById('compareInGeulgyeol');
    const hint = document.getElementById('integrationHint');
    button.hidden = false;
    hint.hidden = false;

    button.addEventListener('click', () => {
      const text = getText();
      if (!text.trim()) { empty(); return; }
      window.parent.postMessage({ type: 'geulgyeol:compare', text, title: '생기부 감사관 문서' }, location.origin);
    });

    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.type !== 'geulgyeol:audit' || typeof data.text !== 'string' || !data.text.trim()) return;
      audit(data.text);
    });

    window.parent.postMessage({ type: 'geulgyeol:ready' }, location.origin);
  };
})();
