/* 연출 — 감사 결과를 ‘계산된 숫자’가 아니라 ‘검사받은 장면’으로 보여 준다.
   판정은 이미 엔진이 끝낸 뒤이고, 여기서는 그 결과를 순서대로 드러내기만 한다.
   움직임을 줄이도록 설정한 이용자에게는 즉시 최종 상태를 보여 준다. */
(function (root) {
  const SA = root.SA || (root.SA = {});

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let playing = null;

  /** 재생 중인 연출을 즉시 끝맺는다 (화면을 다시 그리기 전에 반드시 호출) */
  function stop() { if (playing) playing(); }

  /**
   * 타임라인 한 벌을 돌린다. 아무 곳이나 누르면 건너뛰고 최종 상태로 간다.
   * steps: [{ at: ms, run }] · final: 최종 상태를 만드는 함수(여러 번 불려도 안전해야 함)
   */
  function play(steps, final, total) {
    stop();
    const timers = steps.map((s) => setTimeout(s.run, s.at));
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      document.removeEventListener('pointerdown', finish, true);
      document.removeEventListener('keydown', onKey, true);
      playing = null;
      final();
    };
    const onKey = (ev) => { if (/^(Escape|Enter| )$/.test(ev.key)) finish(); };
    timers.push(setTimeout(finish, total));
    document.addEventListener('pointerdown', finish, true);
    document.addEventListener('keydown', onKey, true);
    playing = finish;
    return finish;
  }

  /** 숫자를 세며 올리거나 내린다 */
  function countTo(el, from, to, ms) {
    if (!el) return () => {};
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.textContent = String(to); };
  }

  /* ───────────── ① 개별 감사: 읽기 → 형광펜 → 결과 공개 ───────────── */

  /**
   * 1단계 어절을 하나씩 읽어 내려가다가, 형광펜 구절에 이르면 그 자리에서 긋는다.
   * 2단계 다 읽고 나서야 점수·판정·검사 항목을 공개한다.
   */
  function scanSingle(report, audit) {
    if (!report) return;
    const marks = [...report.querySelectorAll('mark.hl')];
    const logs = [...report.querySelectorAll('.audit-log .log-line')];
    const scoreEl = report.querySelector('.sv'); // 게이지 한가운데 숫자
    const stampBox = report.querySelector('.stamp-box');
    const doc = report.querySelector('.doc');
    const units = [...report.querySelectorAll('[data-ri]')]
      .sort((a, b) => Number(a.dataset.ri) - Number(b.dataset.ri));

    const final = () => {
      report.classList.remove('reading', 'revealing');
      marks.forEach((m) => m.classList.add('painted'));
      logs.forEach((l) => l.classList.add('on'));
      units.forEach((el) => el.classList.remove('reading', 'read'));
      if (scoreEl) scoreEl.textContent = String(audit.overall);
      if (stampBox) stampBox.classList.add('pop');
    };
    if (reduced() || !doc || !units.length) { final(); return; }

    report.classList.add('reading');
    if (scoreEl) scoreEl.textContent = '0';

    const bar = report.querySelector('.rh-bar > i');
    const idx = report.querySelector('.rh-i');
    const foundBox = report.querySelector('.rh-found');
    const redEl = report.querySelector('.rh-red b');
    const amberEl = report.querySelector('.rh-amber b');
    const setCount = (el, name, n) => {
      if (!el) return;
      el.textContent = `${name} ${n}`;
      el.parentElement.classList.toggle('zero', !n);
    };

    // 읽는 데 걸리는 시간: 어절은 글자 수에, 형광펜 구절은 조금 더 길게
    const cost = units.map((el) => {
      const len = (el.textContent || '').trim().length;
      if (el.tagName === 'MARK') return 230 + Math.min(180, len * 10);
      return Math.max(40, Math.min(150, 26 + len * 19)) + (/[.!?]$/.test(el.textContent.trim()) ? 70 : 0);
    });
    const total = cost.reduce((a, b) => a + b, 0);
    const BUDGET = 3000;
    const scale = total > BUDGET ? BUDGET / total : 1;

    const steps = [];
    let at = 80;
    let red = 0;
    let amber = 0;
    let lastSent = -1;
    units.forEach((el, k) => {
      const dur = cost[k] * scale;
      steps.push({
        at,
        run: () => {
          if (k) units[k - 1].classList.remove('reading');
          el.classList.add('reading');
          const si = Number(el.dataset.si);
          if (!Number.isNaN(si) && si !== lastSent) {
            lastSent = si;
            if (idx) idx.textContent = String(si + 1);
          }
          if (bar) bar.style.width = `${Math.round(((k + 1) / units.length) * 100)}%`;
        },
      });
      if (el.tagName === 'MARK') {
        // 구절을 다 읽은 순간 형광펜이 그어지고, 무엇을 찾았는지 적힌다
        steps.push({
          at: at + dur * 0.55,
          run: () => {
            el.classList.add('painted');
            const red2 = el.classList.contains('red');
            if (red2) setCount(redEl, '위험', ++red); else setCount(amberEl, '주의', ++amber);
            if (foundBox) {
              const chip = document.createElement('span');
              chip.className = `found ${red2 ? 'red' : 'amber'}`;
              chip.textContent = `${el.dataset.kind} · ${el.dataset.name}`;
              foundBox.appendChild(chip);
              while (foundBox.children.length > 4) foundBox.removeChild(foundBox.firstChild);
            }
          },
        });
      }
      steps.push({ at: at + dur, run: () => { el.classList.remove('reading'); el.classList.add('read'); } });
      at += dur;
    });

    // 2단계: 결과 공개
    const revealAt = at + 300;
    let stopCount = () => {};
    steps.push({
      at: revealAt,
      run: () => {
        report.classList.remove('reading');
        report.classList.add('revealing');
        units.forEach((el) => el.classList.remove('read', 'reading'));
        stopCount = countTo(scoreEl, 0, audit.overall, 700);
        logs.forEach((l, i) => setTimeout(() => l.classList.add('on'), 120 + i * 70));
      },
    });
    steps.push({ at: revealAt + 520, run: () => { if (stampBox) stampBox.classList.add('pop'); } });

    play(steps, () => { stopCount(); final(); }, revealAt + 1150);
  }

  /* ───────────── ② 학급 감사: 학생 카드가 세 칸으로 날아가 꽂힌다 ───────────── */

  function sortClass(scope) {
    if (!scope) return;
    const cards = [...scope.querySelectorAll('.stu-card')];
    const nums = [...scope.querySelectorAll('.triage-col .cnt')];
    const finals = nums.map((n) => Number(n.dataset.n || n.textContent) || 0);
    const deck = document.querySelector('.deck');
    const deckN = document.querySelector('.deck-n');

    const final = () => {
      scope.classList.remove('sorting');
      cards.forEach((c) => { c.classList.add('landed'); c.style.removeProperty('--dx'); c.style.removeProperty('--dy'); });
      nums.forEach((n, i) => { n.textContent = String(finals[i]); });
      if (deckN) deckN.textContent = String(cards.length);
    };
    if (reduced() || !cards.length) { final(); return; }

    scope.classList.add('sorting');
    nums.forEach((n) => { n.textContent = '0'; });

    // 카드마다 ‘대기 더미 → 제 칸’ 이동 거리를 미리 재 둔다
    const from = deck ? deck.getBoundingClientRect() : { left: window.innerWidth / 2, top: 0, width: 108, height: 74 };
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--dx', `${Math.round(from.left + from.width / 2 - (r.left + r.width / 2))}px`);
      c.style.setProperty('--dy', `${Math.round(from.top + from.height / 2 - (r.top + r.height / 2))}px`);
      c.style.setProperty('--rot', `${(i % 2 ? 1 : -1) * (4 + (i % 5) * 2)}deg`);
    });

    // 학번 순으로 날아가야 세 칸으로 갈라지는 게 보인다
    const order = [...cards].sort((a, b) => String(a.dataset.id).localeCompare(String(b.dataset.id)));
    const GAP = cards.length > 24 ? 46 : cards.length > 12 ? 62 : 90;
    const landed = [0, 0, 0];
    const colOf = (c) => (c.classList.contains('red') ? 0 : c.classList.contains('amber') ? 1 : 2);
    const steps = order.map((c, i) => ({
      at: 120 + i * GAP,
      run: () => {
        c.classList.add('landed');
        const k = colOf(c);
        landed[k] += 1;
        if (nums[k]) nums[k].textContent = String(landed[k]);
        if (deckN) deckN.textContent = String(cards.length - i - 1);
      },
    }));
    play(steps, final, 120 + cards.length * GAP + 620);
  }

  SA.stage = { scanSingle, sortClass, stop, reduced };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.stage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
