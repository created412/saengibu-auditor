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

  /* ───────────── ① 개별 감사: 스캔선 · 형광펜 · 점수 · 도장 ───────────── */

  function scanSingle(report, audit) {
    if (!report) return;
    const marks = [...report.querySelectorAll('mark.hl')];
    const logs = [...report.querySelectorAll('.audit-log .log-line')];
    const scoreEl = report.querySelector('.sv'); // 게이지 한가운데 숫자
    const stampBox = report.querySelector('.stamp-box');
    const wrap = report.querySelector('.doc-wrap');
    const doc = report.querySelector('.doc');

    const final = () => {
      report.classList.remove('scanning');
      const line = report.querySelector('.scanline');
      if (line) line.remove();
      marks.forEach((m) => m.classList.add('painted'));
      logs.forEach((l) => l.classList.add('on'));
      if (scoreEl) scoreEl.textContent = String(audit.overall);
      if (stampBox) stampBox.classList.add('pop');
    };
    if (reduced() || !wrap || !doc) { final(); return; }

    report.classList.add('scanning');
    if (scoreEl) scoreEl.textContent = '100';

    const line = document.createElement('div');
    line.className = 'scanline';
    line.innerHTML = '<span>검사 중</span>';
    const h = doc.offsetHeight;
    line.style.setProperty('--scan-h', `${h}px`);
    wrap.appendChild(line);

    const SCAN = 950;
    const steps = [];
    // 형광펜은 스캔선이 지나간 자리에서 칠해진다
    const top = doc.getBoundingClientRect().top;
    marks.forEach((m) => {
      const y = m.getBoundingClientRect().top - top;
      const at = 80 + Math.max(0, Math.min(1, y / Math.max(1, h))) * SCAN;
      steps.push({ at, run: () => m.classList.add('painted') });
    });
    // 검사 항목 로그가 한 줄씩 쌓인다
    logs.forEach((l, i) => steps.push({ at: 120 + i * 105, run: () => l.classList.add('on') }));

    let stopCount = () => {};
    steps.push({
      at: SCAN + 120,
      run: () => {
        const l = report.querySelector('.scanline');
        if (l) l.classList.add('done');
        report.classList.remove('scanning');   // 기준 막대가 0에서 차오른다
        stopCount = countTo(scoreEl, 100, audit.overall, 620);
      },
    });
    steps.push({ at: SCAN + 700, run: () => { if (stampBox) stampBox.classList.add('pop'); } });

    play(steps, () => { stopCount(); final(); }, SCAN + 1050);
  }

  /* ───────────── ② 학급 감사: 30명이 세 칸으로 갈라지는 장면 ───────────── */

  function sortClass(scope) {
    if (!scope) return;
    const chips = [...scope.querySelectorAll('.triage-chip')];
    const nums = [...scope.querySelectorAll('.triage-col .cnt')];
    const finals = nums.map((n) => Number(n.dataset.n || n.textContent) || 0);

    const final = () => {
      scope.classList.remove('sorting');
      chips.forEach((c) => c.classList.add('landed'));
      nums.forEach((n, i) => { n.textContent = String(finals[i]); });
    };
    if (reduced() || !chips.length) { final(); return; }

    scope.classList.add('sorting');
    nums.forEach((n) => { n.textContent = '0'; });

    const SPAN = 900;
    const steps = chips.map((c, i) => ({
      at: 60 + (i / Math.max(1, chips.length)) * SPAN,
      run: () => c.classList.add('landed'),
    }));
    const stops = [];
    steps.push({
      at: 120,
      run: () => nums.forEach((n, i) => stops.push(countTo(n, 0, finals[i], SPAN))),
    });
    play(steps, () => { stops.forEach((s) => s()); final(); }, SPAN + 420);
  }

  SA.stage = { scanSingle, sortClass, stop, reduced };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.stage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
