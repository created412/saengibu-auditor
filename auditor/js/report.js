/* 감사 보고서 한 장 — 연수·발표 자료에 그대로 쓸 수 있도록 PNG로 만든다.
   외부 라이브러리 없이 캔버스에 직접 그린다(오프라인·API 키 불필요 원칙). */
(function (root) {
  const SA = root.SA || (root.SA = {});

  const C = {
    bg: '#e7ecf6', card: '#ffffff', ink: '#26272c', ink2: '#4b505c', ink3: '#858c9b',
    line: '#cfd9ea', line2: '#e4eaf4', blue: '#6591cf', blueDeep: '#3f6db6', blueSoft: '#dbe6f6',
    red: '#cf4236', redBg: '#fce9e6', amber: '#b06f0c', amberBg: '#fdf1dc', amberLine: '#e2a23c',
    green: '#2d7a4c', greenBg: '#e2f2e7', paper: '#fffdf7',
  };
  const W = 1100;          // 카드 폭(CSS px)
  const PAD = 52;
  const SCALE = 2;         // 인쇄·발표용 2배 해상도

  const display = (px, weight = 400) => {
    const has = typeof document !== 'undefined' && document.fonts && document.fonts.check(`${weight} ${px}px "Black Han Sans"`);
    return `${weight} ${px}px ${has ? '"Black Han Sans", ' : ''}"Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  };
  const sans = (px, weight = 400) => `${weight} ${px}px "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 한글은 어절이 길어도 줄바꿈이 되어야 한다 — 띄어쓰기로 먼저, 그래도 넘치면 글자로 */
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxW) { line = test; continue; }
        if (line) out.push(line);
        if (ctx.measureText(word).width <= maxW) { line = word; continue; }
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxW) { out.push(chunk); chunk = ch; } else chunk += ch;
        }
        line = chunk;
      }
      out.push(line);
    }
    return out.filter((l, i) => l || i === 0);
  }

  function drawLines(ctx, lines, x, y, lineH) {
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return y + lines.length * lineH;
  }

  /** 판정 도장 — 살짝 기울여 찍는다 */
  function stamp(ctx, x, y, v) {
    const tone = { red: [C.red, C.redBg], amber: [C.amber, C.amberBg], green: [C.green, C.greenBg] }[v.key] || [C.ink, C.line2];
    const w = 168;
    const h = 86;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-5 * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = tone[1];
    ctx.beginPath(); // 모서리 잘린 태그 (표지 오마주)
    const cut = 16;
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h - cut); ctx.lineTo(w - cut, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tone[0];
    ctx.font = display(40);
    ctx.textAlign = 'center';
    ctx.fillText(v.stamp, w / 2, 48);
    ctx.font = sans(13, 700);
    ctx.fillText(v.sub, w / 2, 70);
    ctx.textAlign = 'left';
    ctx.restore();
    return h;
  }

  function pill(ctx, x, y, text, tone) {
    const map = { red: [C.red, C.redBg], amber: [C.amber, C.amberBg], green: [C.green, C.greenBg], blue: [C.blueDeep, C.blueSoft] };
    const [fg, bg] = map[tone] || map.blue;
    ctx.font = sans(14, 700);
    const w = ctx.measureText(text).width + 26;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, 30, 15);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(text, x + 13, y + 20);
    return w + 8;
  }

  /**
   * 보고서를 그려 캔버스를 돌려준다.
   * data: { badge, title, date, score:{from,to,label}, verdict, chips, checks, pairs, ledger, note }
   */
  function drawCard(data) {
    const tall = document.createElement('canvas');
    tall.width = W * SCALE;
    tall.height = 2600 * SCALE;
    const ctx = tall.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, 2600);
    const M = 22; // 바깥 여백
    const cw = W - M * 2;

    let y = M + 44;
    const x = M + PAD;
    const innerW = cw - PAD * 2;

    // ── 머리: 배지 · 날짜 · 제목
    ctx.font = sans(15, 700);
    const bw = ctx.measureText(data.badge).width + 30;
    ctx.fillStyle = C.blue;
    roundRect(ctx, x, y - 22, bw, 34, 17);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(data.badge, x + 15, y);
    ctx.fillStyle = C.ink3;
    ctx.font = sans(14);
    ctx.textAlign = 'right';
    ctx.fillText(data.date, x + innerW, y);
    ctx.textAlign = 'left';

    y += 62;
    ctx.fillStyle = C.ink;
    ctx.font = display(46);
    ctx.fillText(data.title, x, y);

    // ── 점수 흐름 · 판정 도장
    y += 46;
    const stampTop = y - 30;
    ctx.font = display(76);
    const from = String(data.score.from);
    const to = String(data.score.to);
    ctx.fillStyle = C.ink3;
    ctx.fillText(from, x, y + 40);
    const fw = ctx.measureText(from).width;
    ctx.font = display(40);
    ctx.fillStyle = C.blue;
    ctx.fillText('→', x + fw + 16, y + 34);
    const aw = ctx.measureText('→').width;
    ctx.font = display(76);
    ctx.fillStyle = data.score.to >= 80 ? C.green : data.score.to >= 60 ? C.amber : C.red;
    ctx.fillText(to, x + fw + aw + 32, y + 40);
    const tw = ctx.measureText(to).width;
    ctx.font = sans(15, 700);
    ctx.fillStyle = C.ink2;
    ctx.fillText(data.score.label, x + fw + aw + tw + 44, y + 38);
    if (data.verdict) stamp(ctx, x + innerW - 176, stampTop, data.verdict);

    // ── 요약 칩
    y += 76;
    let cx = x;
    (data.chips || []).forEach((c) => { cx += pill(ctx, cx, y, c.text, c.tone); });
    if ((data.chips || []).length) y += 52;

    // ── 검사 항목
    ctx.strokeStyle = C.line2;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + innerW, y); ctx.stroke();
    y += 30;
    ctx.font = sans(15, 700);
    ctx.fillStyle = C.ink2;
    ctx.fillText(data.checksTitle || '검사 항목', x, y);
    y += 24;
    const colW = (innerW - 40) / 2;
    (data.checks || []).forEach((c, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = x + col * (colW + 40);
      const ly = y + row * 30;
      ctx.font = sans(14);
      ctx.fillStyle = C.ink2;
      ctx.fillText(`▸ ${c.label}`, lx, ly);
      ctx.font = sans(14, 700);
      ctx.fillStyle = c.tone === 'bad' ? C.red : c.tone === 'ok' ? C.green : C.ink;
      ctx.textAlign = 'right';
      ctx.fillText(c.value, lx + colW, ly);
      ctx.textAlign = 'left';
    });
    y += Math.ceil((data.checks || []).length / 2) * 30 + 16;

    // ── 고친 문장: 전 → 후
    if ((data.pairs || []).length) {
      ctx.strokeStyle = C.line2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + innerW, y); ctx.stroke();
      y += 30;
      ctx.font = sans(15, 700);
      ctx.fillStyle = C.ink2;
      ctx.fillText(data.pairsTitle || '고친 문장', x, y);
      y += 26;
      data.pairs.slice(0, 5).forEach((p) => {
        const tx = x + 26;
        const tw2 = innerW - 26;
        ctx.font = sans(15);
        const bl = wrap(ctx, p.before || '(없던 문장)', tw2);
        const al = wrap(ctx, p.after || '(삭제)', tw2);
        const hgt = (bl.length + al.length) * 26 + 16;
        ctx.fillStyle = C.paper;
        roundRect(ctx, x, y - 20, innerW, hgt + 12, 12);
        ctx.fill();
        ctx.fillStyle = C.red;
        ctx.fillRect(x + 10, y - 14, 4, bl.length * 26);
        ctx.fillStyle = C.ink3;
        let yy = drawLines(ctx, bl, tx, y, 26);
        ctx.fillStyle = C.green;
        ctx.fillRect(x + 10, yy - 14, 4, al.length * 26);
        ctx.fillStyle = C.ink;
        ctx.font = sans(15, 700);
        yy = drawLines(ctx, al, tx, yy + 8, 26);
        y = yy + 22;
      });
      if (data.pairs.length > 5) {
        ctx.font = sans(13);
        ctx.fillStyle = C.ink3;
        ctx.fillText(`외 ${data.pairs.length - 5}문장`, x, y);
        y += 24;
      }
    }

    // ── 집계
    if ((data.ledger || []).length) {
      y += 6;
      const bwid = (innerW - 24) / data.ledger.length;
      data.ledger.forEach((l, i) => {
        const lx = x + i * (bwid + 12);
        ctx.fillStyle = l.tone === 'zero' ? C.greenBg : l.tone === 'warn' ? C.redBg : C.blueSoft;
        roundRect(ctx, lx, y, bwid, 74, 14);
        ctx.fill();
        ctx.fillStyle = l.tone === 'zero' ? C.green : l.tone === 'warn' ? C.red : C.blueDeep;
        ctx.font = display(34);
        ctx.textAlign = 'center';
        ctx.fillText(String(l.n), lx + bwid / 2, y + 40);
        ctx.font = sans(13, 700);
        ctx.fillStyle = C.ink2;
        ctx.fillText(l.label, lx + bwid / 2, y + 62);
        ctx.textAlign = 'left';
      });
      y += 96;
    }

    // ── 꼬리말
    ctx.font = sans(13);
    ctx.fillStyle = C.ink3;
    y = drawLines(ctx, wrap(ctx, data.note, innerW), x, y + 6, 22) + 4;

    // 카드 테두리를 마지막에 그린다(높이가 정해진 뒤)
    const cardH = y + PAD - M;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = C.card;
    roundRect(ctx, M, M, cw, cardH, 26);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 3;
    roundRect(ctx, M, M, cw, cardH, 26);
    ctx.stroke();

    const H = cardH + M * 2;
    const out = document.createElement('canvas');
    out.width = W * SCALE;
    out.height = Math.round(H * SCALE);
    const octx = out.getContext('2d');
    octx.fillStyle = C.bg;
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(tall, 0, 0, W * SCALE, Math.round(H * SCALE), 0, 0, W * SCALE, Math.round(H * SCALE));
    return out;
  }

  function download(canvas, filename) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve(blob ? blob.size : 0);
      }, 'image/png');
    });
  }

  SA.report = { drawCard, download, W, SCALE };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.report;
})(typeof globalThis !== 'undefined' ? globalThis : window);
