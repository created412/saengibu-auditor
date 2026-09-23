/* 화면 — 개별 감사(진단 → 3초 처방 → 수정 작업대) / 학급 감사(세특 응급실 → 집중치료 → 완료 보고서)
 * 등급: 위험(기재 금지 · 바로 수정, 남아 있으면 입력 불가) / 주의(수정 권장, 품질 점수에 반영) */
(function () {
  const { ko, lex, engine: E, demo, art } = window.SA;

  /* ───────────── 유틸 ───────────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const critName = (key) => (lex.CRITERIA.find((c) => c.key === key) || {}).name || '';
  const barColor = (v) => (v >= 80 ? 'green' : v >= 60 ? 'amber' : 'red');
  const hangulChars = (bytes) => Math.round(bytes / 3);
  const hasSlot = (t) => lex.SLOT.test(String(t));

  let toastTimer;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function keepScroll(fn) {
    const wb = $('.workbench');
    const top = wb ? wb.scrollTop : 0;
    const active = document.activeElement && document.activeElement.id;
    fn();
    const wb2 = $('.workbench');
    if (wb2) wb2.scrollTop = top;
    if (active) { const el = document.getElementById(active); if (el) el.focus({ preventScroll: true }); }
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function diffHtml(a, b) {
    return E.diffWords(a, b).map((d) => (d.op === '=' ? esc(d.w) : d.op === '+' ? `<ins class="add">${esc(d.w)}</ins>` : `<del class="rem">${esc(d.w)}</del>`)).join(' ');
  }

  function byteLine(text) {
    const b = ko.neisBytes(text);
    return `<div class="byte-counter ${b > lex.BYTE_LIMIT ? 'over' : ''}">${b.toLocaleString()} byte · 한글 약 ${hangulChars(b)}자 / 상한 1,500 byte(500자)</div>`;
  }

  function verdictTag(v, big) {
    return `<div class="gtag ${v.key} ${big ? 'big' : ''}" aria-label="판정 ${esc(v.stamp)}">${esc(v.stamp)}<small>${esc(v.sub)}</small></div>`;
  }

  function arch({ badge, title, sub, tag }) {
    return `<section class="arch">
      <div class="arch-badge">${esc(badge)}</div>
      <h1 class="arch-title">${title}</h1>
      <p class="arch-sub">${sub}</p>
      <div class="arch-tag">${esc(tag)}</div>
    </section>`;
  }

  /* ═════════════ 개별 감사 ═════════════ */
  const S = {
    stage: 'input', original: '', text: '', source: '',
    facts: [], confirmed: 0, dismissed: new Set(), verified: new Set(), history: [],
    audit: null, first: null, panel: null, drafts: {},
  };

  function reauditSingle() {
    S.audit = E.audit(S.text, { sources: S.source, dismissed: S.dismissed, verified: S.verified });
  }

  function snapshot() {
    return { text: S.text, facts: [...S.facts], confirmed: S.confirmed, dismissed: new Set(S.dismissed), verified: new Set(S.verified) };
  }

  function startSingle(text, source) {
    Object.assign(S, {
      stage: 'report', original: text.trim(), text: text.trim(), source: (source || '').trim(),
      facts: [], confirmed: 0, dismissed: new Set(), verified: new Set(), history: [], panel: null, drafts: {},
    });
    reauditSingle();
    S.first = S.audit;
    S.popStamp = true;
    location.hash = '#single';
    render();
    window.scrollTo({ top: 0 });
  }

  function draftFor(sig) {
    if (!S.drafts[sig]) S.drafts[sig] = { checked: [], edits: {}, customOn: false, custom: '', keepEval: true, detail: '', sourceFact: '' };
    return S.drafts[sig];
  }

  function singleMetrics() {
    const g = E.guard(S.original, S.text, S.facts);
    return { facts: S.facts.length + S.confirmed, improved: E.changedSentences(S.original, S.text), aiAdded: g.novel.length, novel: g.novel };
  }

  function legend() {
    return `<div class="legend">
      <div class="legend-item red"><span class="gtag red">위험</span><div><b>기재 금지 · 바로 수정</b>
        <p>대회·수상, 공인어학시험, 모의고사 성적, 논문, 대학명·기관명·상호명·강사명, 학교명, 자격증, 방과후학교, 해외 활동, 부모 직업, 장학금, 분량 초과 등 — 2026 기재요령 조항·쪽수와 함께 알려 드립니다. 남아 있으면 <b>입력 불가</b>입니다.</p></div></div>
      <div class="legend-item amber"><span class="gtag amber">주의</span><div><b>수정 권장</b>
        <p>역량의 근거 부족, 추상적 표현, 교과 지식 단순 서술, 학생 소감 어투, 활동 나열, 과장, 명사형 종결 — 좋은 세특의 요건(성취과정·성취특성이 드러나는 구체적 기록)에 비추어 알려 드립니다.</p></div></div>
      <div class="legend-item blue"><span class="gtag blue">가드</span><div><b>AI 임의 사실 추가 0건</b>
        <p>수정은 선생님이 확인한 사실만으로 합니다. 원문과 확인 사실에 없는 표현·수치·부정의 변경은 사실 가드가 잡습니다.</p></div></div>
    </div>`;
  }

  function renderSingleInput() {
    const text = S.original || '';
    return `
    ${arch({ badge: '2026학년도', title: '생기부<br>감사관', sub: '학교생활기록부 기재요령에 맞춰 세특을 점검하고,<br>선생님이 확인한 사실만으로 고칩니다.', tag: '고등학교' })}
    <div class="home-grid">
      <figure class="art-wrap">${art.cover()}</figure>
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between"><h2>세특 한 편 감사</h2><span class="pill-badge">개별 감사</span></div>
        <label class="field"><span>세특 원문</span>
          <textarea id="inText" rows="7" placeholder="과목별 세부능력 및 특기사항을 붙여넣으세요.">${esc(text)}</textarea>
        </label>
        <div id="inBytes">${byteLine(text)}</div>
        <details class="source-box" ${S.source ? 'open' : ''}>
          <summary>원자료 대조 감사 <span class="faint">(선택)</span></summary>
          <p class="small muted" style="margin:6px 0 8px">탐구보고서·발표 기록·관찰 메모를 넣으면 세특의 문장마다 학생 자료에서 근거를 찾습니다.</p>
          <textarea id="inSource" rows="5" placeholder="[탐구보고서 3쪽] …&#10;[교사 관찰 메모] …">${esc(S.source)}</textarea>
        </details>
        <div class="row">
          <button class="btn" data-act="single-demo" type="button">예시 불러오기</button>
          <div class="spacer"></div>
          <button class="btn btn-primary btn-lg" data-act="single-start" type="button">감사 시작</button>
        </div>
      </div>
    </div>
    ${legend()}`;
  }

  function highlightDoc(text, issues, opts = {}) {
    const list = [...issues].filter((i) => !i.global && i.end > i.start).sort((a, b) => a.start - b.start);
    let html = '';
    let pos = 0;
    for (const i of list) {
      if (i.start < pos) continue;
      const label = opts.labels ? opts.labels[i.signature] : '';
      html += esc(text.slice(pos, i.start));
      html += `<mark class="hl ${i.severity} ${opts.active === i.signature ? 'active' : ''}" role="button" tabindex="0" data-act="focus-issue" data-sig="${esc(i.signature)}" title="${esc(i.gradeName)} · ${esc(i.label)} — 클릭하면 안내와 처방이 열립니다">${esc(text.slice(i.start, i.end))}<sup>${esc(label)}</sup></mark>`;
      pos = i.end;
    }
    html += esc(text.slice(pos));
    return html;
  }

  function issueNumbers(issues) {
    const map = {};
    issues.forEach((i, k) => { map[i.signature] = k + 1; });
    return map;
  }

  function criteriaBars(scores, base) {
    return `<div class="crit-list">${lex.CRITERIA.map((c) => {
      const v = scores[c.key];
      const b = base ? base[c.key] : null;
      const delta = b != null && v !== b ? `<span class="delta">${v > b ? '+' : ''}${v - b}</span>` : '';
      return `<div class="crit" title="${esc(c.q)}"><span class="name">${c.name}</span>
        <span class="bar"><i class="${barColor(v)}" style="width:${v}%"></i>${b != null && b !== v ? `<b style="left:${b}%"></b>` : ''}</span>
        <span class="val">${v}${delta}</span></div>`;
    }).join('')}</div>`;
  }

  function chainHtml() {
    const a = S.audit;
    const typeName = { 행동: '학생 행동', 사고: '학생 사고', 평가: '교사 평가', 서술: '서술' };
    return `<div class="chain">${a.sentences.map((s) => {
      const evIssue = a.issues.find((i) => i.type === 'evidence' && i.start >= s.start && i.end <= s.end);
      const srcIssue = a.issues.find((i) => i.type === 'source' && i.start === s.start);
      return `<div class="chain-row"><div class="chain-units">${s.clauses.map((c, k) => {
        let cls = c.type === '행동' ? 'act' : c.type === '사고' ? 'think' : '';
        let mark = '';
        if (c.type === '평가') {
          const bad = evIssue && c.abs <= evIssue.start + 2 && c.abs + c.text.length >= evIssue.start;
          cls = bad ? 'eval-bad' : 'eval-ok';
          mark = bad ? ' ✗' : ' ✓';
        }
        return `${k ? '<span class="arrow">→</span>' : ''}<span class="unit ${cls}"><b>${typeName[c.type]}${mark}</b>${esc(c.text)}</span>`;
      }).join('')}</div>
      ${s.sourceMatch ? `<div class="src-hit">근거 발견 ✓ <q>${esc(s.sourceMatch)}</q></div>` : ''}
      ${srcIssue ? `<div class="src-hit miss">⚠ 근거 확인 불가 — ${esc(srcIssue.why)}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  const ACTION_LABEL = {
    source: '📄 자료에서 근거 찾기', observe: '✍️ 내가 관찰한 내용 추가', delete: '✂️ 문제 표현 삭제',
    keep: '✔ 확인 후 유지', detail: '✍️ 구체 내용 채우기', restyle: '명사형으로 고치기', replace: '🔁 대체어로 바꾸기',
  };

  function actionLabel(issue, act) {
    if (issue.type === 'forbidden') {
      if (act === 'delete') return '✂️ 이 부분 삭제';
      if (act === 'replace') return `🔁 ‘${issue.replacement}’(으)로 바꾸기`;
    }
    if (act === 'delete' && issue.type === 'exag') return '✂️ 강조어 빼기';
    if (act === 'delete' && issue.type === 'symbol') return '✂️ 기호 지우기';
    if (act === 'delete' && (issue.type === 'source' || issue.type === 'knowledge' || issue.type === 'selfvoice')) return '✂️ 문장 삭제';
    if (act === 'delete' && issue.type === 'vague') return '✂️ 부사 빼기';
    if (act === 'detail' && (issue.type === 'knowledge' || issue.type === 'selfvoice')) return '✍️ 관찰한 행동으로 바꾸기';
    if (act === 'detail' && issue.type === 'listing') return '✍️ 발견·판단 한 문장 더하기';
    if (act === 'keep' && issue.type === 'source') return '✔ 직접 확인한 내용';
    if (act === 'observe' && issue.type === 'cliche') return '✍️ 이 학생만의 장면으로';
    return ACTION_LABEL[act];
  }

  /** 초안 상태 → applyAnswer 에 넘길 응답 (칸이 남은 관찰 후보는 적용 불가) */
  function answerFromDraft(issue, q, action, d) {
    if (action === 'observe') {
      const facts = d.checked.map((k) => (d.edits[k] != null ? d.edits[k] : q.candidates[k])).filter((f) => f && f.trim());
      if (d.customOn && d.custom.trim()) facts.push(d.custom.trim());
      if (!facts.length || facts.some(hasSlot)) return null;
      return { kind: 'facts', facts, keepEval: q.canKeepEval && d.keepEval };
    }
    if (action === 'source') return d.sourceFact.trim() ? { kind: 'facts', facts: [d.sourceFact.trim()], keepEval: q.canKeepEval && d.keepEval } : null;
    if (action === 'detail') return d.detail.trim() ? { kind: 'detail', detail: d.detail } : null;
    if (action === 'delete') return { kind: 'delete' };
    if (action === 'restyle') return { kind: 'restyle' };
    if (action === 'replace') return { kind: 'replace' };
    if (action === 'keep') return { kind: 'keep', confirmed: issue.type === 'source' };
    return null;
  }

  function previewHtml(issue, q, action, d) {
    const ans = answerFromDraft(issue, q, action, d);
    if (!ans) {
      const slotLeft = action === 'observe' && d.checked.some((k) => hasSlot(d.edits[k] != null ? d.edits[k] : q.candidates[k]));
      return `<span class="lbl">미리보기</span><span class="faint">${slotLeft ? '〔 〕 칸을 실제로 관찰한 내용으로 채워 주세요. 칸이 남아 있으면 적용할 수 없습니다.' : '선택하거나 입력하면 수정안이 여기에 나타납니다.'}</span>`;
    }
    if (ans.kind === 'keep') {
      return issue.type === 'forbidden'
        ? '<span class="lbl">처리</span>기재 금지 사항이 아니라고 판단하셨습니다. 이 표현은 다시 지적하지 않습니다.'
        : '<span class="lbl">처리</span>교사 판단으로 유지합니다. 목록에서는 빠지지만 품질 점수는 그대로입니다.';
    }
    const r = E.applyAnswer(S.text, issue, ans);
    return `<span class="lbl">수정안 미리보기</span>${diffHtml(S.text, r.text)}`;
  }

  function panelHtml(issue, q, action) {
    const d = draftFor(issue.signature);
    const sig = esc(issue.signature);
    let body = '';
    if (action === 'observe') {
      body = `<div class="q">${esc(q.prompt)} <span class="faint small">실제로 본 것만 체크하고 〔 〕 칸을 채우세요</span></div>
        ${q.candidates.map((c, k) => {
          const on = d.checked.includes(k);
          return `<label class="opt"><input type="checkbox" data-act="draft-check" data-sig="${sig}" data-k="${k}" ${on ? 'checked' : ''}>
            <span class="opt-text">${on ? `<input type="text" id="edit-${k}-${sig.length}" data-input="draft-edit" data-sig="${sig}" data-k="${k}" value="${esc(d.edits[k] != null ? d.edits[k] : c)}">` : esc(c)}</span></label>`;
        }).join('')}
        <label class="opt"><input type="checkbox" data-act="draft-custom" data-sig="${sig}" ${d.customOn ? 'checked' : ''}>
          <span class="opt-text">${d.customOn ? `<input type="text" id="custom-${sig.length}" data-input="draft-custom-text" data-sig="${sig}" value="${esc(d.custom)}" placeholder="${esc(q.customPlaceholder)}">` : '직접 입력'}</span></label>
        ${q.canKeepEval ? `<label class="row small" style="margin:8px 0 0 8px"><input type="checkbox" data-act="draft-keepeval" data-sig="${sig}" ${d.keepEval ? 'checked' : ''}> 근거를 쓴 뒤 평가 표현도 남기기</label>` : ''}`;
    } else if (action === 'source') {
      if (!S.source) body = '<div class="small muted">원자료가 없습니다. 입력 화면에서 탐구보고서·관찰 메모를 넣으면 근거를 찾아 드립니다.</div>';
      else {
        const hits = q.sourceHits;
        body = `<div class="q">제출 자료에서 관련 대목을 찾았습니다</div>
          ${hits.length ? hits.map((h, k) => `<div class="src-card"><div>${esc(h.text)}</div>
            <button class="btn btn-sm" style="margin-top:6px" type="button" data-act="use-source" data-sig="${sig}" data-k="${k}">이 대목을 근거로 기록</button></div>`).join('')
          : '<div class="small muted">관련 대목을 찾지 못했습니다. ‘내가 관찰한 내용 추가’를 이용하세요.</div>'}
          ${d.sourceFact || hits.length ? `<label class="field" style="margin-top:10px"><span>기록할 문장 (기록 문체로 다듬어 주세요)</span>
            <input type="text" id="srcfact-${sig.length}" data-input="draft-source" data-sig="${sig}" value="${esc(d.sourceFact)}" placeholder="예: 사건 장소의 관할 문제를 근거로 일본의 재판 권한을 비판함"></label>` : ''}
          ${q.canKeepEval ? `<label class="row small" style="margin:8px 0 0"><input type="checkbox" data-act="draft-keepeval" data-sig="${sig}" ${d.keepEval ? 'checked' : ''}> 근거를 쓴 뒤 평가 표현도 남기기</label>` : ''}`;
      }
    } else if (action === 'detail') {
      body = `<div class="q">${esc(q.prompt)}</div>
        <input type="text" id="detail-${sig.length}" data-input="draft-detail" data-sig="${sig}" value="${esc(d.detail)}" placeholder="${esc(q.customPlaceholder)}">
        ${q.sourceHits.length ? `<div class="small muted" style="margin-top:8px">자료 참고: ${q.sourceHits.map((h) => `“${esc(h.text)}”`).join(' ')}</div>` : ''}`;
    } else if (action === 'delete') {
      body = `<div class="q">${issue.type === 'forbidden' ? '기재 금지 표현이 들어 있는 부분을 지우고 문장을 자연스럽게 닫습니다.' : issue.type === 'evidence' ? '근거가 없는 평가 표현을 지우고 문장을 자연스럽게 다시 닫습니다.' : '해당 부분을 지웁니다.'}</div>`;
    } else if (action === 'replace') {
      body = `<div class="q">‘${esc(issue.matches[0])}’을(를) 상위 일반어 ‘${esc(issue.replacement)}’(으)로 바꿉니다. 조사도 함께 맞춥니다.</div>`;
    } else if (action === 'keep') {
      body = `<div class="q">${issue.type === 'source' ? '선생님이 직접 확인한 내용이면 그대로 둡니다. ‘교사 확인’으로 기록됩니다.' : '문제가 없다고 판단하시면 그대로 둡니다.'}</div>`;
    } else if (action === 'restyle') {
      body = '<div class="q">명사형 어미가 아닌 문장을 모두 명사형(~함, ~임)으로 바꿉니다.</div>';
    }
    const ready = !!answerFromDraft(issue, q, action, d);
    return `<div class="panel">${body}
      <div class="preview" id="pv-${esc(issue.id)}">${previewHtml(issue, q, action, d)}</div>
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button class="btn btn-sm btn-ghost" type="button" data-act="panel-close">취소</button>
        <button class="btn btn-sm btn-primary" type="button" data-act="panel-apply" data-sig="${sig}" ${ready ? '' : 'disabled'} id="apply-${esc(issue.id)}">적용</button>
      </div></div>`;
  }

  /** 형광펜을 클릭했을 때 그 자리에 열리는 안내·처방 풍선 */
  function popoverHtml(issue) {
    const q = E.buildQuestion(issue, S.audit, { sources: S.source });
    const action = S.panel.action;
    const danger = issue.grade === 'danger';
    const refs = issue.refs || (issue.ref ? [issue.ref] : []);
    const heading = issue.type === 'forbidden' ? issue.titles.join(' · ') : issue.label;
    return `<div class="popover ${issue.severity}" id="popover" role="dialog" aria-label="${esc(issue.gradeName)} · ${esc(heading)}">
      <button class="pop-close" type="button" data-act="panel-close" aria-label="닫기">✕</button>
      <div class="pop-head"><span class="gtag ${issue.severity}">${esc(issue.gradeName)}</span><b>${esc(heading)}</b>
        ${refs.map((r) => `<span class="ref">기재요령 ${esc(r)}</span>`).join('')}</div>
      ${issue.global ? '' : `<div class="pop-quote">“${esc(issue.mode === 'replace' ? issue.matches.join('’, ‘') : issue.text)}”</div>`}
      <div class="pop-why">${esc(issue.why)}</div>
      ${q.mode === 'info' ? '<div class="small muted" style="margin-top:8px">아래 ‘직접 편집’으로 분량을 줄여 주세요. 줄이면 이 표시가 사라집니다.</div>' : `
      <div class="rx-label">${danger ? '🚨 바로 수정 — 기재 금지' : '💊 3초 처방'}</div>
      <div class="rx-actions">${q.actions.map((act) => `<button class="btn ${action === act ? 'on' : ''}" type="button" data-act="rx" data-sig="${esc(issue.signature)}" data-action="${act}" ${act === 'source' && !S.source ? 'title="원자료를 넣으면 사용할 수 있습니다"' : ''}>${esc(actionLabel(issue, act))}</button>`).join('')}</div>
      ${action ? panelHtml(issue, q, action) : ''}`}
    </div>`;
  }

  /** 형광펜 위치에 풍선을 붙인다 (좁은 화면에서는 CSS가 아래쪽 고정 시트로 바꿈) */
  function positionPopover() {
    const pop = document.getElementById('popover');
    const wrap = document.querySelector('.doc-wrap');
    if (!pop || !wrap) return;
    const mark = wrap.querySelector('mark.hl.active');
    if (!mark || window.matchMedia('(max-width: 760px)').matches) return;
    // 풍선은 기록 바로 아래에 붙고, 화살표가 누른 형광펜을 가리킨다
    const popBox = pop.getBoundingClientRect();
    const box = mark.getBoundingClientRect();
    const caret = box.left - popBox.left + box.width / 2;
    pop.style.setProperty('--caret', `${Math.max(18, Math.min(caret, pop.offsetWidth - 18))}px`);
    const over = popBox.bottom - window.innerHeight;
    if (over > 0) window.scrollBy({ top: over + 16, behavior: 'smooth' });
  }

  function renderSingleReport() {
    const a = S.audit;
    const f = S.first;
    const v = E.verdict(a);
    const all = a.issues;
    const nums = issueNumbers(all);
    const m = singleMetrics();
    const pop = S.popStamp; S.popStamp = false;

    const active = S.panel && currentIssue(S.panel.sig);
    const next = a.issues.find((i) => !active || i.signature !== active.signature) || a.issues[0];

    return `
    <div class="report">
      <div class="card card-pad report-head-card">
        <div class="report-head">
          <div><span class="pill-badge">생기부 감사 결과</span><div class="score-big">${a.overall}<small> / 100</small></div><div class="small muted">품질 점수${f && f.overall !== a.overall ? ` · 처음 ${f.overall}점` : ''}</div></div>
          <div class="head-mid stack" style="margin:0">
            <div class="row" style="gap:8px">
              <span class="gcount red ${a.danger.length ? '' : 'zero'}"><b>위험 ${a.danger.length}</b> 기재 금지 · 바로 수정</span>
              <span class="gcount amber ${a.caution.length ? '' : 'zero'}"><b>주의 ${a.caution.length}</b> 수정 권장</span>
              ${a.hasSource ? '<span class="pill blue">원자료 대조 ✓</span>' : ''}
            </div>
            <div class="muted small">${a.bytes.toLocaleString()} byte(한글 약 ${hangulChars(a.bytes)}자) / 1,500 byte</div>
            <div class="row no-print"><button class="btn btn-sm" type="button" data-act="single-new">← 새 세특</button><button class="btn btn-sm" type="button" data-act="print">인쇄</button></div>
          </div>
          <div class="${pop ? 'pop' : ''}">${verdictTag(v, true)}</div>
        </div>
        ${a.danger.length ? `<div class="alert red">기재 금지 사항 ${a.danger.length}건이 남아 있어 <b>나이스에 입력할 수 없습니다.</b> 아래 기록에서 <b>빨간 형광펜</b>을 눌러 먼저 고쳐 주세요. 품질 점수와는 별개로 판정합니다.</div>` : ''}
      </div>

      <div class="card card-pad work-card">
        <div class="work-head">
          <div><span class="pill-badge">감사 대상 기록 · 수정 작업대</span>
            <p class="work-hint">형광펜을 클릭하면 <b>왜 문제인지</b>와 <b>처방</b>이 그 자리에 열립니다.
              <span class="legend-inline"><span class="hl-chip red"></span>위험 ${a.danger.length}<span class="hl-chip amber"></span>주의 ${a.caution.length}</span></p></div>
          <div class="score-flow"><span class="from">${f.overall}</span><span class="arrow">→</span><span style="color:var(--${barColor(a.overall)})">${a.overall}</span></div>
        </div>

        ${S.editing ? `<textarea id="editText" rows="7">${esc(S.text)}</textarea>
          <p class="faint small" style="margin:6px 0 0">교과 내용 속 낱말을 잘못 잡았거나 분량을 줄여야 할 때 직접 고치세요. 저장하면 다시 감사합니다.</p>
          <div class="row" style="justify-content:flex-end;margin-top:8px">
            <button class="btn btn-sm btn-ghost" type="button" data-act="edit-cancel">취소</button>
            <button class="btn btn-sm btn-primary" type="button" data-act="edit-save">저장 후 다시 감사</button></div>`
        : `<div class="doc-wrap">
            <div class="doc">${highlightDoc(a.text, all, { active: S.panel && S.panel.sig, labels: nums }) || '<span class="faint">(빈 기록)</span>'}</div>
            ${active ? popoverHtml(active) : ''}
          </div>
          ${all.length ? '' : `<div class="empty-ok"><div class="big">감사 통과 ✓</div><div class="muted small">위험·주의 사항이 모두 해결되었습니다. 나이스 입력 전에 한 번 더 읽어 주세요.</div></div>`}`}
        ${a.notes.length ? `<div class="stack small muted" style="margin-top:10px">${a.notes.map((n) => `<div>ⓘ ${esc(n.text)}</div>`).join('')}</div>` : ''}
        ${byteLine(S.text)}

        <div class="work-bar no-print">
          ${next ? `<button class="btn btn-primary btn-sm" type="button" data-act="focus-issue" data-sig="${esc(next.signature)}">${active ? '다음 표시로 ▸' : `표시 ${all.length}곳 중 첫 곳부터 ▸`}</button>` : ''}
          ${S.editing ? '' : '<button class="btn btn-sm" type="button" data-act="edit-toggle">✏️ 직접 편집</button>'}
          <button class="btn btn-sm" type="button" data-act="undo" ${S.history.length ? '' : 'disabled'}>↶ 되돌리기</button>
          <button class="btn btn-sm" type="button" data-act="reset-original" ${S.text !== S.original ? '' : 'disabled'}>원문으로</button>
          <div class="spacer"></div>
          <button class="btn btn-sm" type="button" data-act="copy">📋 나이스용 복사</button>
        </div>
        ${S.text !== S.original ? `<details class="diff-box"><summary>수정 전 · 후 비교</summary><div class="preview">${diffHtml(S.original, S.text)}</div></details>` : ''}

        <div class="ledger" style="margin-top:14px">
          <div><strong>${m.facts}</strong><span>교사 확인 사실</span></div>
          <div><strong>${m.improved}</strong><span>개선한 문장</span></div>
          <div class="${m.aiAdded ? 'warn' : 'zero'}" title="${m.aiAdded ? esc(m.novel.join(', ')) : '원문·확인 사실에 없는 표현이 없습니다'}"><strong>${m.aiAdded}</strong><span>AI 임의 추가</span></div>
        </div>
        <p class="faint small" style="margin-top:12px">결과는 언제나 초안입니다. 기재요령(19쪽 5-다)에 따라 AI 보조 도구를 쓴 경우 최종 입력 전에 허위·과장 여부와 유의사항 준수를 선생님이 직접 확인해야 합니다.</p>
      </div>

      <div class="report-cols">
        <div class="card card-pad">
          <div class="row" style="justify-content:space-between;margin-bottom:14px"><h2>7대 감사기준</h2><span class="faint small">막대 위 세로선 = 처음 점수</span></div>
          ${criteriaBars(a.scores, f && f !== a ? f.scores : null)}
          <div class="swap" style="margin-top:18px">
            <div class="pct" style="color:var(--${barColor(100 - a.swapRisk)})">${a.swapRisk}%</div>
            <div><b>이름 바꿔도 되는 세특인가?</b><div class="small muted">학생 교체 가능성 — ${a.swapRisk >= 60 ? '이 기록에는 해당 학생에게만 나타나는 구체적인 질문·해석·결론·탐구과정이 부족합니다.' : a.swapRisk >= 35 ? '학생 고유의 장면이 일부 있지만 더 드러낼 여지가 있습니다.' : '이 학생만의 구체적인 장면이 드러나는 기록입니다.'}</div></div>
          </div>
        </div>

        <div class="card card-pad">
          <h2 style="margin-bottom:6px">증거 연결 분석</h2>
          <p class="small muted" style="margin:0 0 12px"><b>교사 평가 ← 학생 사고 ← 학생 행동</b> 사이에 증거 연결고리가 있는지 봅니다.</p>
          ${chainHtml()}
        </div>
      </div>
    </div>`;
  }

  function renderSingle() {
    const root = $('#view-single');
    keepScroll(() => { root.innerHTML = S.stage === 'input' ? renderSingleInput() : renderSingleReport(); });
    if (S.panel) requestAnimationFrame(positionPopover);
  }

  function currentIssue(sig) {
    return S.audit.issues.find((i) => i.signature === sig);
  }

  function applySingle(issue, answer) {
    S.history.push(snapshot());
    const r = E.applyAnswer(S.text, issue, answer);
    // 기재 금지(위험)에는 '유지'가 없다 — 바꾸거나 지워야 한다
    if (r.dismissed) { if (r.confirmed) S.verified.add(r.dismissed); else S.dismissed.add(r.dismissed); }
    if (r.confirmed) S.confirmed++;
    S.text = r.text;
    S.facts.push(...r.facts);
    delete S.drafts[issue.signature];
    S.panel = null;
    const before = S.audit;
    reauditSingle();
    if (r.dismissed) toast(issue.grade === 'danger' ? '기재 금지 사항이 아니라고 표시했습니다.' : '교사 판단으로 유지했습니다.');
    else if (before.danger.length && !S.audit.danger.length) toast('기재 금지 사항을 모두 고쳤습니다. 이제 입력 가능합니다.');
    else toast(`수정 완료 · ${before.overall} → ${S.audit.overall}점`);
  }

  function updatePreview(sig) {
    const issue = currentIssue(sig);
    if (!issue || !S.panel) return;
    const q = E.buildQuestion(issue, S.audit, { sources: S.source });
    const d = draftFor(sig);
    const pv = document.getElementById(`pv-${issue.id}`);
    if (pv) pv.innerHTML = previewHtml(issue, q, S.panel.action, d);
    const btn = document.getElementById(`apply-${issue.id}`);
    if (btn) btn.disabled = !answerFromDraft(issue, q, S.panel.action, d);
  }

  /* ═════════════ 학급 감사 ═════════════ */
  const C = {
    stage: 'input', title: '', raw: '', parsed: [], students: [],
    before: null, now: null, queue: [], pos: 0, drafts: {}, last: null,
  };

  function parseDelimited(text) {
    const rows = [];
    const delim = text.includes('\t') ? '\t' : ',';
    let row = [];
    let field = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') q = false;
        else field += ch;
      } else if (ch === '"' && field === '') q = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some((c) => c.trim())) rows.push(row);
    return rows;
  }

  /** 표 → 학생 목록. 머리글이 있으면 이름으로 열을 찾고, 없으면 [학번, 이름, 세특, 원자료] 순서로 본다 */
  function rowsToStudents(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((c) => String(c).replace(/\s/g, ''));
    const find = (re) => head.findIndex((h) => re.test(h));
    let idCol = find(/학번|번호/);
    let nameCol = find(/이름|성명/);
    let textCol = find(/세특|세부능력|특기사항|기록|내용/);
    let srcCol = find(/원자료|자료|보고서|메모/);
    let body = rows;
    if (textCol !== -1) body = rows.slice(1);
    else {
      const w = Math.max(...rows.map((r) => r.length));
      if (w >= 4) [idCol, nameCol, textCol, srcCol] = [0, 1, 2, 3];
      else if (w === 3) [idCol, nameCol, textCol, srcCol] = [0, 1, 2, -1];
      else if (w === 2) [idCol, nameCol, textCol, srcCol] = [-1, 0, 1, -1];
      else [idCol, nameCol, textCol, srcCol] = [-1, -1, 0, -1];
    }
    if (srcCol === textCol) srcCol = -1;
    return body
      .map((r, i) => ({
        id: String((idCol >= 0 && r[idCol]) || i + 1).trim(),
        name: String((nameCol >= 0 && r[nameCol]) || '').trim(),
        text: String(r[textCol] || '').trim(),
        source: String((srcCol >= 0 && r[srcCol]) || '').trim(),
      }))
      .filter((s) => s.text.length >= 10);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function readFile(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      if (!window.XLSX) {
        try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); }
        catch (e) { toast('엑셀을 읽으려면 인터넷 연결이 필요합니다. CSV로 저장해 올려 주세요.'); return; }
      }
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      C.parsed = rowsToStudents(rows);
      C.raw = '';
    } else {
      const text = await file.text();
      C.raw = text;
      C.parsed = rowsToStudents(parseDelimited(text));
    }
    if (!C.title) C.title = file.name.replace(/\.[^.]+$/, '');
    render();
  }

  function startClass(students, title) {
    C.title = title || C.title || '우리 반';
    C.students = students.map((s) => ({ ...s, original: s.text, facts: [], confirmed: 0, dismissed: new Set(), verified: new Set(), status: 'pending' }));
    C.drafts = {}; C.last = null;
    classReaudit();
    C.before = C.now;
    C.stage = 'dash';
    render();
    window.scrollTo({ top: 0 });
  }

  function classReaudit() {
    const byId = new Map(C.students.map((s) => [s.id, s]));
    C.now = E.classAudit(C.students, { dismissedFor: (id) => byId.get(id).dismissed });
    // 교사 확인(오탐·직접 확인)은 감점 없이 제외
    C.now.results.forEach((r) => {
      const st = byId.get(r.id);
      if (!st.verified.size) return;
      r.audit.issues = r.audit.issues.filter((i) => i.grade === 'danger' || !st.verified.has(i.signature));
      r.audit.danger = r.audit.issues.filter((i) => i.grade === 'danger');
      r.audit.caution = r.audit.issues.filter((i) => i.grade === 'caution');
      r.verdict = E.verdict(r.audit);
    });
  }

  function resultOf(id) { return C.now.results.find((r) => r.id === id); }
  function studentOf(id) { return C.students.find((s) => s.id === id); }

  function dangerTally(res) {
    const map = new Map();
    res.results.forEach((r) => r.audit.danger.forEach((i) => (i.titles || [i.label]).forEach((t) => map.set(t, (map.get(t) || 0) + 1))));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderClassInput() {
    const n = C.parsed.length;
    return `
    ${arch({ badge: '세특 응급실', title: '학급<br>감사', sub: '한 반의 세특을 한 번에 점검하고, 기재 금지 사항은 바로,<br>나머지는 학생마다 딱 필요한 질문만 드립니다.', tag: '학급 단위' })}
    <div class="home-grid">
      <figure class="art-wrap">${art.cover()}</figure>
      <div class="card card-pad stack">
        <div class="row" style="justify-content:space-between"><h2>한 반 세특 넣기</h2><span class="pill-badge">학급 감사</span></div>
        <label class="field"><span>학급 이름</span><input type="text" id="clsTitle" value="${esc(C.title)}" placeholder="예: 2학년 3반 한국사"></label>
        <label class="field"><span>세특 표 붙여넣기 <span class="faint">— 엑셀에서 복사: 학번 · 이름 · 세특 · 원자료(선택)</span></span>
          <textarea id="clsRaw" rows="7" placeholder="20301&#9;김서윤&#9;고려의 대외 관계에 관심을 가지고 …">${esc(C.raw)}</textarea></label>
        <div class="row">
          <label class="btn" style="cursor:pointer">파일 올리기 (CSV·엑셀)<input type="file" id="clsFile" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden></label>
          <button class="btn" type="button" data-act="class-demo">예시 학급 불러오기</button>
          <div class="spacer"></div>
          <span class="small ${n ? '' : 'faint'}" id="clsCount">${n ? `${n}명 인식됨` : '아직 인식된 학생이 없습니다'}</span>
        </div>
        ${n ? `<div class="table-wrap"><table class="students"><thead><tr><th>학번</th><th>이름</th><th>세특 앞부분</th><th>원자료</th></tr></thead><tbody>
          ${C.parsed.slice(0, 4).map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.text.slice(0, 38))}…</td><td>${s.source ? '있음' : '-'}</td></tr>`).join('')}
          </tbody></table></div>` : ''}
        <button class="btn btn-primary btn-lg" type="button" data-act="class-start" ${n ? '' : 'disabled'}>학급 감사 시작</button>
        <p class="faint small" style="margin:0">학생 기록은 이 브라우저 안에서만 처리되며 어디로도 보내거나 저장하지 않습니다.</p>
      </div>
    </div>
    ${legend()}`;
  }

  function renderClassDash() {
    const c = C.now;
    const r0 = C.before;
    const doneCount = C.students.filter((s) => s.status === 'done').length;
    const nameOf = (id) => { const s = studentOf(id); return s ? `${s.id} ${s.name}` : id; };
    const topIssue = (a) => {
      const t = a.danger[0] || [...a.caution].filter((i) => i.type !== 'style').sort((x, y) => y.gain - x.gain)[0];
      if (!t) return '<span class="pill green">양호</span>';
      const head = t.type === 'forbidden' ? t.titles.join('·') : t.label;
      return `<span class="pill ${t.severity}">${esc(t.gradeName)}</span> <span class="small">${esc(head)}</span>`;
    };
    const maxCliche = c.topCliches.length ? c.topCliches[0][1] : 1;
    const tally = dangerTally(c);

    return `
    <div class="dash-grid">
      <div class="card card-pad span-7">
        <div class="er-head">
          <div>
            <span class="pill-badge">세특 응급실</span>
            <h2 style="font-size:24px;margin-top:10px">${esc(C.title)} 생기부 건강도</h2>
            <div class="row" style="align-items:baseline;gap:14px"><span class="health" style="color:var(--${barColor(c.health)})">${c.health}점</span>
              ${r0 && r0.health !== c.health ? `<span class="muted">처음 ${r0.health}점</span>` : ''}</div>
          </div>
          <div class="stack" style="text-align:right">
            <div class="muted small">예상 수정시간</div><div class="display-num">약 ${c.estMinutes}분</div>
          </div>
        </div>
        <div class="triage">
          <div class="red"><strong>${c.triage.red}명</strong><span>위험 · 기재 금지 포함<br>입력 불가</span></div>
          <div class="amber"><strong>${c.triage.amber}명</strong><span>주의 · 보완 권장</span></div>
          <div class="green"><strong>${c.triage.green}명</strong><span>양호</span></div>
        </div>
        <div class="row" style="margin-top:18px">
          <button class="btn btn-red btn-lg" type="button" data-act="treat-start">${doneCount ? '집중치료 이어하기' : '집중치료 시작'}</button>
          ${doneCount ? '<button class="btn" type="button" data-act="treat-finish">완료 보고서</button>' : ''}
          <div class="spacer"></div>
          <button class="btn btn-sm" type="button" data-act="export-csv">결과 CSV</button>
          <button class="btn btn-sm btn-ghost" type="button" data-act="class-reset">← 다시 입력</button>
        </div>
      </div>

      <div class="card card-pad span-5">
        <h2 style="margin-bottom:8px">학급 감사 결과</h2>
        <table class="stat-table">
          <tr><td>학생 수</td><td>${c.stats.students}명</td></tr>
          <tr class="red-row"><td>위험 · 기재 금지 포함</td><td>${c.stats.forbidden}명 (${c.stats.dangerIssues}건)</td></tr>
          <tr><td>평균 기록 품질</td><td>${c.health}점</td></tr>
          <tr><td>역량의 근거 부족</td><td>${c.stats.noEvidence}명</td></tr>
          <tr><td>고유성 부족</td><td>${c.stats.lowUnique}명</td></tr>
          <tr><td>문장 반복 의심</td><td>${c.stats.dupPairs}쌍</td></tr>
          <tr><td>구체적 사고과정 부족</td><td>${c.stats.lowProcess}명</td></tr>
        </table>
        ${tally.length ? `<h3 style="margin:16px 0 8px">기재 금지 유형</h3><div class="id-chips">${tally.map(([t, n]) => `<span class="pill red">${esc(t)} ${n}</span>`).join('')}</div>` : ''}
      </div>

      <div class="card card-pad span-7">
        <div class="row" style="justify-content:space-between"><h2>🧬 세특 DNA 분석</h2><span class="faint small">같은 문장 뼈대를 공유하는 학생 묶음</span></div>
        <div style="margin-top:12px">${c.patterns.length ? c.patterns.slice(0, 4).map((p) => `
          <div class="dna"><div class="row" style="justify-content:space-between"><b>${esc(p.name)} — ${p.ids.length}명</b></div>
            <div class="dna-flow">${p.template.split(' → ').map((t) => `<code>${esc(t)}</code>`).join('<span class="arrow">→</span>')}</div>
            <div class="id-chips">${p.ids.map((id) => `<span class="id-chip">${esc(nameOf(id))}</span>`).join('')}</div></div>`).join('')
          : '<p class="muted">3명 이상이 같은 문장 뼈대를 공유하는 패턴은 없습니다.</p>'}</div>
        ${c.pairs.length ? `<h3 style="margin:16px 0 8px">문장 구조 유사도 상위</h3><div class="pairs">${c.pairs.slice(0, 6).map((p) => `
          <div class="pair"><span>${esc(nameOf(p.a))} ↔ ${esc(nameOf(p.b))}</span><b style="text-align:right;color:var(--red)">${Math.round(p.score * 100)}%</b></div>`).join('')}
          ${c.pairs.length > 6 ? `<div class="faint small">외 ${c.pairs.length - 6}쌍</div>` : ''}</div>` : ''}
      </div>

      <div class="card card-pad span-5 stack">
        <h2>가장 많이 쓴 표현</h2>
        ${c.topCliches.length ? c.topCliches.map(([t, n]) => `<div class="cliche-row"><span>“${esc(t)}”</span><span class="bar"><i class="amber" style="width:${(n / maxCliche) * 100}%"></i></span><b style="text-align:right">${n}회</b></div>`).join('') : '<p class="muted">반복되는 상투 표현이 없습니다.</p>'}
        <hr class="divider">
        <h2>학급 평균 — 7대 감사기준</h2>
        ${criteriaBars(c.criteriaAvg, r0 && r0 !== c ? r0.criteriaAvg : null)}
      </div>

      <div class="card card-pad span-8">
        <div class="row" style="justify-content:space-between;margin-bottom:10px"><h2>학생별 감사표</h2><span class="faint small">위험 먼저, 점수 낮은 순</span></div>
        <div class="table-wrap"><table class="students"><thead><tr><th>학번</th><th>이름</th><th>점수</th><th>판정</th><th>가장 급한 문제</th><th>교체 가능성</th><th></th></tr></thead><tbody>
          ${[...c.results].sort((a, b) => (b.audit.danger.length > 0) - (a.audit.danger.length > 0) || a.audit.overall - b.audit.overall).map((r) => {
            const st = studentOf(r.id);
            return `<tr><td>${esc(r.id)}</td><td>${esc(r.name)}${st.status === 'done' ? ' <span class="pill green">치료 완료</span>' : ''}</td>
              <td class="num" style="color:var(--${barColor(r.audit.overall)})">${r.audit.overall}</td>
              <td><span class="pill ${r.verdict.key}">${esc(r.verdict.label)}</span></td>
              <td>${topIssue(r.audit)}</td><td class="num">${r.audit.swapRisk}%</td>
              <td><button class="btn btn-sm" type="button" data-act="open-single" data-id="${esc(r.id)}">자세히</button></td></tr>`;
          }).join('')}
        </tbody></table></div>
      </div>

      <div class="card card-pad span-4">
        <span class="pill-badge">다음 학기를 위한</span>
        <h2 style="margin:10px 0 6px">학기 초 관찰 포인트</h2>
        <p class="small muted" style="margin-top:0">우리 반 기록에서 가장 약한 기준입니다. 세특을 쓸 때가 아니라 <b>수업하는 동안</b> 이것을 메모해 두세요.</p>
        ${c.observe.map((o) => `<div style="margin-top:12px"><b>${o.criterion.name}</b> <span class="faint small">평균 ${o.avg}점</span>
          <ul class="observe small">${o.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
      </div>
    </div>`;
  }

  function buildQueue() {
    C.queue = [...C.now.results]
      .filter((r) => studentOf(r.id).status === 'pending' && r.verdict.key !== 'green' && (E.topQuestions(r.audit).length || r.audit.danger.length))
      .sort((a, b) => (b.audit.danger.length > 0) - (a.audit.danger.length > 0) || a.audit.overall - b.audit.overall)
      .map((r) => r.id);
    C.pos = 0;
  }

  function classQuestions(id) {
    const r = resultOf(id);
    return E.topQuestions(r.audit, { sources: studentOf(id).source });
  }

  function cdraft(id, sig) {
    const k = `${id}|${sig}`;
    if (!C.drafts[k]) C.drafts[k] = { checked: [], edits: {}, customOn: false, custom: '', none: false, choice: -1, detail: '' };
    return C.drafts[k];
  }

  function classAnswer(q, d) {
    if (d.none && q.none) return q.none.answer;
    if (q.mode === 'choice') return d.choice >= 0 ? q.choices[d.choice].answer : null;
    if (q.mode === 'text') return d.detail.trim() ? { kind: 'detail', detail: d.detail } : null;
    if (q.mode !== 'multi') return null;
    const pool = [...q.candidates, ...q.sourceHits.map((h) => h.text)];
    const facts = d.checked.map((k) => (d.edits[k] != null ? d.edits[k] : pool[k])).filter((f) => f && f.trim());
    if (d.customOn && d.custom.trim()) facts.push(d.custom.trim());
    if (!facts.length || facts.some(hasSlot)) return null;
    return { kind: 'facts', facts, keepEval: q.canKeepEval };
  }

  function qcardHtml(id, item, k) {
    const { issue, question: q } = item;
    const d = cdraft(id, issue.signature);
    const sig = esc(issue.signature);
    const answered = !!classAnswer(q, d);
    let body = '';
    if (q.mode === 'choice') {
      body = q.choices.map((ch, j) => `<label class="opt"><input type="radio" name="q-${k}" data-act="c-choice" data-sig="${sig}" data-k="${j}" ${d.choice === j ? 'checked' : ''}><span class="opt-text">${esc(ch.label)}</span></label>`).join('');
    } else if (q.mode === 'text') {
      body = `<input type="text" id="cdetail-${k}" data-input="c-detail" data-sig="${sig}" value="${esc(d.detail)}" placeholder="${esc(q.customPlaceholder)}" ${d.none ? 'disabled' : ''}>
        ${q.sourceHits.length ? `<div class="small muted" style="margin-top:6px">자료 참고: ${q.sourceHits.map((h) => `“${esc(h.text)}”`).join(' ')}</div>` : ''}
        <label class="opt none"><input type="checkbox" data-act="c-none" data-sig="${sig}" ${d.none ? 'checked' : ''}><span class="opt-text">${esc(q.none.label)}</span></label>`;
    } else {
      const pool = [...q.candidates.map((t) => ({ t, src: false })), ...q.sourceHits.map((h) => ({ t: h.text, src: true }))];
      body = `<div class="small faint" style="margin-bottom:4px">실제로 본 것만 체크하고 〔 〕 칸을 채우세요</div>${pool.map((o, j) => {
        const on = d.checked.includes(j);
        return `<label class="opt"><input type="checkbox" data-act="c-check" data-sig="${sig}" data-k="${j}" ${on ? 'checked' : ''} ${d.none ? 'disabled' : ''}>
          <span class="opt-text">${o.src ? '<span class="pill blue">자료</span> ' : ''}${on ? `<input type="text" id="cedit-${k}-${j}" data-input="c-edit" data-sig="${sig}" data-k="${j}" value="${esc(d.edits[j] != null ? d.edits[j] : o.t)}">` : esc(o.t)}</span></label>`;
      }).join('')}
        <label class="opt"><input type="checkbox" data-act="c-custom" data-sig="${sig}" ${d.customOn ? 'checked' : ''} ${d.none ? 'disabled' : ''}>
          <span class="opt-text">${d.customOn ? `<input type="text" id="ccustom-${k}" data-input="c-custom-text" data-sig="${sig}" value="${esc(d.custom)}" placeholder="${esc(q.customPlaceholder)}">` : '직접 입력'}</span></label>
        <label class="opt none"><input type="checkbox" data-act="c-none" data-sig="${sig}" ${d.none ? 'checked' : ''}><span class="opt-text">${esc(q.none.label)}</span></label>`;
    }
    const heading = issue.type === 'forbidden' ? issue.titles.join(' · ') : issue.label;
    const refs = issue.refs || (issue.ref ? [issue.ref] : []);
    return `<div class="qcard ${issue.severity} ${answered ? 'answered' : ''}" id="qc-${k}">
      <div style="margin-bottom:6px"><span class="qno">Q${k + 1}.</span><b>${esc(q.prompt)}</b></div>
      <div class="small muted" style="margin-bottom:6px"><span class="pill ${issue.severity}">${esc(issue.gradeName)}</span> ${esc(heading)}
        ${refs.map((r) => `<span class="ref">기재요령 ${esc(r)}</span>`).join('')} ${issue.global ? '' : `“${esc(issue.mode === 'replace' ? issue.matches.join('’, ‘') : issue.text)}”`}</div>
      ${body}</div>`;
  }

  function renderTreat() {
    if (C.last) return renderTreatResult();
    const id = C.queue[C.pos];
    if (!id) return renderFinale();
    const r = resultOf(id);
    const items = classQuestions(id);
    const dangerItems = items.filter((x) => x.issue.grade === 'danger');
    const cautionItems = items.filter((x) => x.issue.grade !== 'danger');
    const expected = E.expectedScore(r.audit, cautionItems.map((x) => x.issue));
    const labels = {};
    items.forEach((x, k) => { labels[x.issue.signature] = `Q${k + 1}`; });
    const anyAnswered = items.some((x) => classAnswer(x.question, cdraft(id, x.issue.signature)));
    const overflow = r.audit.danger.find((i) => i.type === 'overflow');

    return `<div class="treat stack">
      <div class="row" style="justify-content:space-between"><span class="muted small">집중치료 ${C.pos + 1} / ${C.queue.length}명</span>
        <button class="btn btn-sm btn-ghost" type="button" data-act="to-dash">대시보드로</button></div>
      <div class="progress"><i style="width:${(C.pos / Math.max(1, C.queue.length)) * 100}%"></i></div>
      <div class="card card-pad stack">
        <div class="patient-head">
          <div><span class="pill-badge">${esc(C.title)}</span><h1 class="patient-name">${esc(r.id)} ${esc(r.name)}</h1></div>
          <div class="stack" style="text-align:right;margin:0">
            ${verdictTag(r.verdict)}
            <div class="score-flow"><span class="from">${r.audit.overall}</span><span class="arrow">→</span><span style="color:var(--green)">예상 ${expected}</span></div>
          </div>
        </div>
        <div class="doc">${highlightDoc(r.audit.text, items.map((x) => x.issue), { labels })}</div>
        ${overflow ? `<div class="alert red"><b>분량 초과(기재요령 208쪽)</b> — ${esc(overflow.why)} 대시보드의 ‘자세히’에서 직접 편집으로 줄여 주세요.</div>` : ''}
        ${dangerItems.length ? `<div class="grade-head red"><span class="gtag red">위험</span><b>반드시 처리 — 기재 금지</b><span class="cnt">${dangerItems.length}</span></div>
          <div>${dangerItems.map((x) => qcardHtml(id, x, items.indexOf(x))).join('')}</div>` : ''}
        ${cautionItems.length ? `<div class="grade-head amber"><span class="gtag amber">주의</span><b>이 학생에 대해 ${cautionItems.length}가지만 알려주세요</b><span class="cnt">${cautionItems.length}</span></div>
          <div>${cautionItems.map((x) => qcardHtml(id, x, items.indexOf(x))).join('')}</div>` : ''}
        <div class="row">
          <button class="btn btn-ghost" type="button" data-act="treat-skip">이 학생 건너뛰기</button>
          <div class="spacer"></div>
          <button class="btn btn-primary btn-lg" type="button" data-act="treat-apply" ${anyAnswered ? '' : 'disabled'}>세특 다시 작성</button>
        </div>
      </div></div>`;
  }

  function renderTreatResult() {
    const L = C.last;
    const st = studentOf(L.id);
    const r = resultOf(L.id);
    const left = r.audit.issues.filter((i) => i.type !== 'style');
    return `<div class="treat stack">
      <div class="progress"><i style="width:${((C.pos + 1) / Math.max(1, C.queue.length)) * 100}%"></i></div>
      <div class="card card-pad stack">
        <div class="patient-head">
          <div><span class="pill-badge">다시 감사 완료</span><h1 class="patient-name">${esc(st.id)} ${esc(st.name)}</h1></div>
          <div class="stack" style="text-align:right;margin:0">${verdictTag(r.verdict)}
            <div class="score-flow"><span class="from">${L.before}</span><span class="arrow">→</span><span style="color:var(--${barColor(r.audit.overall)})">${r.audit.overall}</span></div></div>
        </div>
        <div class="preview" style="font-size:16px"><span class="lbl">수정 전 → 후</span>${diffHtml(L.beforeText, st.text)}</div>
        ${byteLine(st.text)}
        <div class="row small">
          <span class="pill ${r.audit.danger.length ? 'red' : 'green'}">위험 ${r.audit.danger.length}건</span>
          <span class="pill green">교사 확인 사실 ${L.facts}건</span>
          <span class="pill ${L.guard.ok ? 'green' : 'red'}">AI 임의 추가 ${L.guard.novel.length}건</span>
          ${left.length ? `<span class="pill amber">남은 지적 ${left.length}건</span>` : '<span class="pill green">통과 ✓</span>'}
        </div>
        <div class="row">
          <button class="btn btn-ghost" type="button" data-act="treat-undo">↶ 되돌리기</button>
          <div class="spacer"></div>
          <button class="btn btn-primary btn-lg" type="button" data-act="treat-next">${C.pos + 1 < C.queue.length ? '다음 학생' : '완료 보고서 보기'}</button>
        </div>
      </div></div>`;
  }

  function classTotals() {
    let facts = 0;
    let improved = 0;
    let aiAdded = 0;
    C.students.forEach((s) => {
      facts += s.facts.length + s.confirmed;
      improved += E.changedSentences(s.original, s.text);
      aiAdded += E.guard(s.original, s.text, s.facts).novel.length;
    });
    return { facts, improved, aiAdded };
  }

  function renderFinale() {
    const b = C.before;
    const n = C.now;
    const t = classTotals();
    const row = (label, x, y, unit, cls = '') => `<tr class="${cls}"><td>${label}</td><td>${x}${unit}</td><td>→</td><td><b style="color:${y < x ? 'var(--green)' : 'inherit'}">${y}${unit}</b></td></tr>`;
    const it = (o, k) => o.issueTotals[k] || 0;
    return `<div class="treat stack">
      ${arch({ badge: '감사 완료 보고서', title: `${esc(C.title)}`, sub: `학급 건강도 <b>${b.health}점 → ${n.health}점</b>`, tag: '감사 완료' })}
      <div class="card card-pad finale stack">
        <table class="change-table">
          ${row('위험 · 기재 금지', it(b, 'forbidden') + it(b, 'overflow'), it(n, 'forbidden') + it(n, 'overflow'), '건', 'red-row')}
          ${row('입력 불가 학생', b.triage.red, n.triage.red, '명', 'red-row')}
          ${row('역량의 근거 부족', it(b, 'evidence'), it(n, 'evidence'), '건')}
          ${row('지식 단순 서술', it(b, 'knowledge'), it(n, 'knowledge'), '건')}
          ${row('추상적 표현', it(b, 'vague'), it(n, 'vague'), '건')}
          ${row('학생 간 반복', b.stats.dupPairs, n.stats.dupPairs, '쌍')}
          ${row('고유성 부족', b.stats.lowUnique, n.stats.lowUnique, '명')}
        </table>
        <p class="zero-line">교사가 확인한 사실 ${t.facts}건을 바탕으로 ${t.improved}개 문장을 개선했습니다.<br>
          AI가 임의로 추가한 학생 활동: <em style="color:${t.aiAdded ? 'var(--red)' : 'var(--green)'}">${t.aiAdded}건</em></p>
        <p class="muted small">‘AI 임의 추가’는 사실 가드가 수정본 전체를 원문·교사 확인 사실과 다시 대조해 센 값입니다(수치·부정 표현 변경 포함).</p>
        <div class="row" style="justify-content:center">
          <button class="btn" type="button" data-act="to-dash">대시보드로</button>
          <button class="btn btn-primary" type="button" data-act="export-csv">결과 CSV 내려받기</button>
        </div>
      </div>
      <div class="card card-pad">
        <h2>“좋은 생기부를 AI에게 써달라고 하지 마세요.”</h2>
        <p class="muted" style="margin:6px 0 0">AI가 선생님에게, 좋은 생기부를 쓰기 위해 필요한 것을 물어보게 하세요. 다음 학기에는 아래를 수업 중에 메모해 두시면 됩니다.</p>
        ${n.observe.map((o) => `<div style="margin-top:12px"><b>${o.criterion.name}</b> <span class="faint small">평균 ${o.avg}점</span><ul class="observe small">${o.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
      </div></div>`;
  }

  function renderClass() {
    const root = $('#view-class');
    let html = '';
    if (C.stage === 'input') html = renderClassInput();
    else if (C.stage === 'dash') html = renderClassDash();
    else html = renderTreat();
    keepScroll(() => { root.innerHTML = html; });
  }

  function applyTreatment() {
    const id = C.queue[C.pos];
    const st = studentOf(id);
    const r = resultOf(id);
    const items = classQuestions(id);
    const snap = { text: st.text, facts: [...st.facts], confirmed: st.confirmed, dismissed: new Set(st.dismissed), verified: new Set(st.verified), status: st.status };
    const answered = items.map(({ issue, question }) => ({ issue, answer: classAnswer(question, cdraft(id, issue.signature)) }));
    const res = E.applyAnswers(st.text, answered);
    res.dismissed.forEach((sig) => {
      const ans = answered.find((x) => x.issue.signature === sig).answer;
      if (ans.confirmed) st.verified.add(sig); else st.dismissed.add(sig);
    });
    st.confirmed += res.confirmed;
    st.facts.push(...res.facts);
    st.text = res.text;
    st.status = 'done';
    classReaudit();
    C.last = { id, before: r.audit.overall, beforeText: snap.text, snapshot: snap, facts: res.facts.length + res.confirmed, guard: E.guard(st.original, st.text, st.facts) };
    render();
    window.scrollTo({ top: 0 });
  }

  function exportCsv() {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const before = new Map((C.before ? C.before.results : []).map((r) => [r.id, r.audit.overall]));
    const lines = [['학번', '이름', '판정', '처음 점수', '현재 점수', '위험(기재 금지)', '주의(수정 권장)', '원문', '수정본', '교사 확인 사실', '바이트'].map(q).join(',')];
    C.now.results.forEach((r) => {
      const st = studentOf(r.id);
      lines.push([r.id, r.name, r.verdict.label, before.get(r.id), r.audit.overall,
        r.audit.danger.map((i) => `${(i.titles || [i.label]).join('·')}(${(i.refs || [i.ref]).join(', ')}): ${i.matches ? i.matches.join(', ') : ''}`).join(' / '),
        r.audit.caution.map((i) => `${i.label}: ${i.global ? '' : i.text}`).join(' / '),
        st.original, st.text, st.facts.join(' / '), ko.neisBytes(st.text)].map(q).join(','));
    });
    download(`${C.title || '학급'}_생기부감사.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  /* ═════════════ 라우팅·이벤트 ═════════════ */
  function currentView() { return location.hash === '#class' ? 'class' : 'single'; }

  function render() {
    const view = currentView();
    $('#view-single').hidden = view !== 'single';
    $('#view-class').hidden = view !== 'class';
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.go === view)));
    if (view === 'single') renderSingle(); else renderClass();
  }

  window.addEventListener('hashchange', render);

  document.addEventListener('click', async (ev) => {
    const go = ev.target.closest('[data-go]');
    if (go) { ev.preventDefault(); location.hash = `#${go.dataset.go}`; return; }
    const el = ev.target.closest('[data-act]');
    // 형광펜 풍선 밖을 누르면 닫는다
    if (S.panel && currentView() === 'single' && !ev.target.closest('.popover') && !ev.target.closest('mark.hl') && (!el || !['rx', 'panel-apply', 'panel-close', 'draft-check', 'draft-custom', 'draft-keepeval', 'use-source'].includes(el.dataset.act))) {
      S.panel = null;
      if (!el) { render(); return; }
    }
    if (!el) return;
    const act = el.dataset.act;
    const sig = el.dataset.sig;

    switch (act) {
      /* 개별 */
      case 'single-demo':
        S.original = demo.single.text; S.source = demo.single.source; render(); break;
      case 'single-start': {
        const text = $('#inText').value.trim();
        if (text.length < 10) { toast('세특을 10자 이상 입력해 주세요.'); return; }
        startSingle(text, $('#inSource').value);
        break;
      }
      case 'single-new':
        S.stage = 'input'; render(); break;
      case 'print':
        window.print(); break;
      case 'focus-issue': {
        if (currentView() === 'class') { // 집중치료 화면: 형광펜 → 해당 질문으로 이동
          const items = classQuestions(C.queue[C.pos]);
          const k = items.findIndex((x) => x.issue.signature === sig);
          const card = document.getElementById(`qc-${k}`);
          if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1200); }
          return;
        }
        const issue = currentIssue(sig);
        if (!issue) return;
        if (S.panel && S.panel.sig === sig) { S.panel = null; render(); return; }
        const q = E.buildQuestion(issue, S.audit, { sources: S.source });
        S.panel = { sig, action: q.actions.find((x) => x !== 'source' || S.source) || null };
        render();
        const mark = document.querySelector('mark.hl.active');
        if (mark) {
          const box = mark.getBoundingClientRect();
          if (box.top < 90 || box.bottom > window.innerHeight - 260) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        requestAnimationFrame(positionPopover);
        break;
      }
      case 'rx': {
        const action = el.dataset.action;
        // 같은 처방을 다시 누르면 그 처방만 접는다 (안내 풍선은 열어 둔다)
        if (S.panel && S.panel.sig === sig && S.panel.action === action) S.panel = { sig, action: null };
        else S.panel = { sig, action };
        render();
        break;
      }
      case 'panel-close':
        S.panel = null; render(); break;
      case 'panel-apply': {
        const issue = currentIssue(sig);
        if (!issue) return;
        const q = E.buildQuestion(issue, S.audit, { sources: S.source });
        const ans = answerFromDraft(issue, q, S.panel.action, draftFor(sig));
        if (ans) { applySingle(issue, ans); render(); }
        break;
      }
      case 'draft-check': {
        const d = draftFor(sig);
        const k = Number(el.dataset.k);
        d.checked = el.checked ? [...d.checked, k] : d.checked.filter((x) => x !== k);
        render();
        if (el.checked) { const input = document.getElementById(`edit-${k}-${sig.length}`); if (input) { input.focus(); const at = input.value.indexOf('〔'); if (at >= 0) input.setSelectionRange(at, input.value.indexOf('〕', at) + 1); } }
        break;
      }
      case 'draft-custom':
        draftFor(sig).customOn = el.checked; render();
        if (el.checked) { const input = document.querySelector('[data-input="draft-custom-text"]'); if (input) input.focus(); }
        break;
      case 'draft-keepeval':
        draftFor(sig).keepEval = el.checked; updatePreview(sig); break;
      case 'use-source': {
        const issue = currentIssue(sig);
        const q = E.buildQuestion(issue, S.audit, { sources: S.source });
        const hit = q.sourceHits[Number(el.dataset.k)];
        draftFor(sig).sourceFact = ko.asRecordSentence(hit.text.replace(/^\[[^\]]*\]\s*/, '').replace(/^나는\s*/, ''));
        render();
        break;
      }
      case 'undo': {
        const h = S.history.pop();
        if (h) { Object.assign(S, h); reauditSingle(); render(); }
        break;
      }
      case 'reset-original':
        S.history.push(snapshot());
        Object.assign(S, { text: S.original, facts: [], confirmed: 0, dismissed: new Set(), verified: new Set(), panel: null });
        reauditSingle(); render();
        break;
      case 'copy':
        try { await navigator.clipboard.writeText(S.text); toast('수정본을 복사했습니다.'); } catch (e) { toast('복사하지 못했습니다. 직접 선택해 복사해 주세요.'); }
        break;
      case 'edit-toggle':
        S.editing = true; render(); { const t = document.getElementById('editText'); if (t) t.focus(); } break;
      case 'edit-cancel':
        S.editing = false; render(); break;
      case 'edit-save': {
        const t = document.getElementById('editText');
        const val = t ? t.value.trim() : '';
        if (!val) { toast('내용을 입력해 주세요.'); return; }
        S.history.push(snapshot());
        S.text = val;
        S.facts.push(val); // 교사가 직접 쓴 문장 — 사실 가드의 기준에 포함
        S.editing = false;
        reauditSingle();
        render();
        toast(`직접 수정 후 다시 감사했습니다 · ${S.audit.overall}점`);
        break;
      }

      /* 학급 */
      case 'class-demo':
        C.title = demo.classDemo.title;
        C.raw = demo.classDemo.students.map((s) => [s.id, s.name, s.text, s.source].map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n');
        C.parsed = demo.classDemo.students;
        render(); break;
      case 'class-start':
        startClass(C.parsed, ($('#clsTitle') || {}).value); break;
      case 'class-reset':
        C.stage = 'input'; render(); break;
      case 'treat-start':
        buildQueue();
        if (!C.queue.length) toast('집중치료가 필요한 학생이 없습니다.');
        C.stage = 'treat'; C.last = null; render(); window.scrollTo({ top: 0 }); break;
      case 'treat-finish':
        C.stage = 'treat'; C.queue = []; C.pos = 0; C.last = null; render(); break;
      case 'to-dash':
        C.stage = 'dash'; C.last = null; render(); break;
      case 'treat-skip':
        studentOf(C.queue[C.pos]).status = 'skipped'; C.pos++; render(); window.scrollTo({ top: 0 }); break;
      case 'treat-apply':
        applyTreatment(); break;
      case 'treat-undo': {
        const L = C.last;
        Object.assign(studentOf(L.id), L.snapshot);
        C.last = null; classReaudit(); render(); break;
      }
      case 'treat-next':
        C.last = null; C.pos++; render(); window.scrollTo({ top: 0 }); break;
      case 'c-choice':
        cdraft(C.queue[C.pos], sig).choice = Number(el.dataset.k); render(); break;
      case 'c-check': {
        const d = cdraft(C.queue[C.pos], sig);
        const k = Number(el.dataset.k);
        d.checked = el.checked ? [...d.checked, k] : d.checked.filter((x) => x !== k);
        render(); break;
      }
      case 'c-custom':
        cdraft(C.queue[C.pos], sig).customOn = el.checked; render(); break;
      case 'c-none': {
        const d = cdraft(C.queue[C.pos], sig);
        d.none = el.checked;
        if (el.checked) { d.checked = []; d.customOn = false; d.detail = ''; }
        render(); break;
      }
      case 'open-single': {
        const st = studentOf(el.dataset.id);
        startSingle(st.text, st.source);
        toast(`${st.id} ${st.name} — 개별 감사 화면에서 보는 중입니다(학급 결과와는 따로 저장됩니다).`);
        break;
      }
      case 'export-csv':
        exportCsv(); break;
      default:
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'inText') { $('#inBytes').innerHTML = byteLine(el.value); S.original = el.value; return; }
    if (el.id === 'inSource') { S.source = el.value; return; }
    if (el.id === 'clsTitle') { C.title = el.value; return; }
    if (el.id === 'clsRaw') {
      C.raw = el.value;
      C.parsed = rowsToStudents(parseDelimited(el.value));
      const n = C.parsed.length;
      $('#clsCount').textContent = n ? `${n}명 인식됨` : '아직 인식된 학생이 없습니다';
      const btn = document.querySelector('[data-act="class-start"]');
      if (btn) btn.disabled = !n;
      return;
    }
    const kind = el.dataset.input;
    if (!kind) return;
    const sig = el.dataset.sig;
    if (kind.startsWith('draft')) {
      const d = draftFor(sig);
      if (kind === 'draft-edit') d.edits[Number(el.dataset.k)] = el.value;
      if (kind === 'draft-custom-text') d.custom = el.value;
      if (kind === 'draft-detail') d.detail = el.value;
      if (kind === 'draft-source') d.sourceFact = el.value;
      updatePreview(sig);
      return;
    }
    if (kind.startsWith('c-')) {
      const id = C.queue[C.pos];
      const d = cdraft(id, sig);
      if (kind === 'c-edit') d.edits[Number(el.dataset.k)] = el.value;
      if (kind === 'c-custom-text') d.custom = el.value;
      if (kind === 'c-detail') d.detail = el.value;
      const items = classQuestions(id);
      const any = items.some((x) => classAnswer(x.question, cdraft(id, x.issue.signature)));
      const btn = document.querySelector('[data-act="treat-apply"]');
      if (btn) btn.disabled = !any;
      const k = items.findIndex((x) => x.issue.signature === sig);
      const card = document.getElementById(`qc-${k}`);
      if (card && k >= 0) card.classList.toggle('answered', !!classAnswer(items[k].question, d));
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'clsFile' && ev.target.files[0]) readFile(ev.target.files[0]);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && S.panel) { S.panel = null; render(); }
  });

  window.addEventListener('resize', () => { if (S.panel) positionPopover(); });

  const markEl = $('#brandMark');
  if (markEl) markEl.innerHTML = art.mark();
  render();
})();
