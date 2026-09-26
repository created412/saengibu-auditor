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
   * 1단계 기록을 문장 단위로 읽어 내려가고, 문장을 다 읽은 자리에 형광펜을 긋는다.
   * 2단계 다 읽고 나서야 점수·판정·검사 항목을 공개한다.
   */
  function scanSingle(report, audit) {
    if (!report) return;
    const marks = [...report.querySelectorAll('mark.hl')];
    const logs = [...report.querySelectorAll('.audit-log .log-line')];
    const scoreEl = report.querySelector('.sv'); // 게이지 한가운데 숫자
    const stampBox = report.querySelector('.stamp-box');
    const doc = report.querySelector('.doc');
    const sents = (audit.sentences || []).map((_, k) => [...report.querySelectorAll(`[data-si="${k}"]`)]);

    const final = () => {
      report.classList.remove('reading', 'revealing');
      marks.forEach((m) => m.classList.add('painted'));
      logs.forEach((l) => l.classList.add('on'));
      report.querySelectorAll('[data-si]').forEach((el) => el.classList.remove('reading', 'read'));
      if (scoreEl) scoreEl.textContent = String(audit.overall);
      if (stampBox) stampBox.classList.add('pop');
    };
    if (reduced() || !doc || !sents.length) { final(); return; }

    report.classList.add('reading');
    if (scoreEl) scoreEl.textContent = '0';

    const bar = report.querySelector('.rh-bar > i');
    const idx = report.querySelector('.rh-i');
    const redEl = report.querySelector('.rh-red b');
    const amberEl = report.querySelector('.rh-amber b');
    const setCount = (el, name, n) => {
      if (!el) return;
      el.textContent = `${name} ${n}`;
      el.parentElement.classList.toggle('zero', !n);
    };

    // 문장마다 읽는 시간을 글자 수에 맞추되, 전체가 길어지면 함께 줄인다
    const raw = sents.map((_, k) => {
      const t = audit.sentences[k].text.length;
      return Math.max(200, Math.min(560, 26 + t * 13));
    });
    const total = raw.reduce((a, b) => a + b, 0);
    const scale = total > 2400 ? 2400 / total : 1;
    const dur = raw.map((x) => x * scale);

    const steps = [];
    let at = 60;
    let red = 0;
    let amber = 0;
    sents.forEach((els, k) => {
      const startAt = at;
      steps.push({
        at: startAt,
        run: () => {
          els.forEach((el) => el.classList.add('reading'));
          if (idx) idx.textContent = String(k + 1);
          if (bar) bar.style.width = `${Math.round(((k + 1) / sents.length) * 100)}%`;
        },
      });
      at += dur[k];
      steps.push({
        at, // 문장을 다 읽은 순간 그 문장의 형광펜이 그어진다
        run: () => {
          els.forEach((el) => { el.classList.remove('reading'); el.classList.add('read'); });
          els.filter((el) => el.tagName === 'MARK').forEach((m) => {
            m.classList.add('painted');
            if (m.classList.contains('red')) setCount(redEl, '위험', ++red); else setCount(amberEl, '주의', ++amber);
          });
        },
      });
    });

    // 2단계: 결과 공개
    const revealAt = at + 260;
    let stopCount = () => {};
    steps.push({
      at: revealAt,
      run: () => {
        report.classList.remove('reading');
        report.classList.add('revealing');
        report.querySelectorAll('[data-si]').forEach((el) => el.classList.remove('read'));
        stopCount = countTo(scoreEl, 0, audit.overall, 700);
        logs.forEach((l, i) => setTimeout(() => l.classList.add('on'), 120 + i * 70));
      },
    });
    steps.push({ at: revealAt + 520, run: () => { if (stampBox) stampBox.classList.add('pop'); } });

    play(steps, () => { stopCount(); final(); }, revealAt + 1150);
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
