import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ShieldCheck,
  ScanText,
  ArrowRight,
  FolderOpen,
  LockKeyhole,
  ArrowLeftRight,
  FileUp,
  X,
  Plus,
  Info,
} from 'lucide-react';
import App from './App.jsx';
import Report from './Report.jsx';
import AiInspection from './AiInspection.jsx';
import { api } from './api.js';
import { Spinner } from './components.jsx';
import { browserMode, assetUrl } from './runtime.js';

const demoSource =
  '산업 혁명은 생산 방식의 변화와 함께 도시의 생활 환경을 크게 바꾸었다. 공장 주변으로 노동자가 모이면서 주거 공간이 부족해지고 위생 문제가 심각해졌다. 당시의 신문 기사와 의회 보고서를 비교하면 노동 시간과 아동 노동에 대한 서로 다른 시각을 확인할 수 있다.';
const demoText =
  '산업 혁명은 생산 방식의 변화와 함께 도시의 생활 환경을 크게 바꾸었다. 공장 주변으로 노동자가 모이면서 주거 공간이 부족해지고 위생 문제가 심각해졌다. 나는 도시 지도를 연도별로 겹쳐 보고 노동자 거주지와 하천 사이의 거리를 직접 비교하였다. 이 과정에서 생산 시설의 확대만으로 도시의 생활 수준이 높아졌다고 판단하기 어렵다는 결론을 내렸다.';
const route = () =>
  (browserMode ? location.hash === '#/audit' || !location.hash || location.hash === '#single' || location.hash === '#class' : location.pathname === '/audit')
    ? 'audit'
    : (browserMode ? location.hash === '#/workspace' : location.pathname === '/workspace')
      ? 'workspace'
      : 'compare';

export default function Suite() {
  const [view, setView] = useState(route),
    [auditorLoaded, setAuditorLoaded] = useState(route() === 'audit');
  const [workspaceLoaded, setWorkspaceLoaded] = useState(route() === 'workspace');
  const [incoming, setIncoming] = useState(null),
    [notice, setNotice] = useState(''),
    [frameKey, setFrameKey] = useState(0);
  const frame = useRef(null),
    pending = useRef(null),
    ready = useRef(false);
  function navigate(next, push = true) {
    setView(next);
    if (next === 'audit') setAuditorLoaded(true);
    if (next === 'workspace') setWorkspaceLoaded(true);
    if (push)
      history.pushState(
        {},
        '',
        browserMode ? '#/' + next : next === 'compare' ? '/' : '/' + (next === 'audit' ? 'audit' : 'workspace'),
      );
    document.title = next === 'audit' ? '생기부 감사관 · 교실 도구함' : '표절감사관 · 교실 도구함';
    window.scrollTo({ top: 0 });
  }
  function deliver() {
    if (ready.current && pending.current && frame.current?.contentWindow) {
      frame.current.contentWindow.postMessage(
        { type: 'geulgyeol:audit', text: pending.current },
        location.origin,
      );
      pending.current = null;
    }
  }
  useEffect(() => {
    const pop = () => navigate(route(), false);
    const message = (event) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'geulgyeol:ready') {
        ready.current = true;
        deliver();
      }
      if (
        event.data?.type === 'geulgyeol:compare' &&
        typeof event.data.text === 'string' &&
        event.data.text.length <= 60000
      ) {
        setIncoming({ text: event.data.text, title: event.data.title, nonce: Date.now() });
        setNotice('감사관의 문서를 가져왔습니다. 사용 가능한 자료로 자동 검사합니다.');
        navigate('compare');
      }
    };
    const audit = (event) => {
      if (!event.detail?.text || event.detail.text.length > 60000) return;
      pending.current = event.detail.text;
      navigate('audit');
      deliver();
    };
    const logout = () => {
      pending.current = null;
      ready.current = false;
      setFrameKey((n) => n + 1);
      setIncoming({ text: '', title: '', nonce: Date.now(), reset: true });
      setNotice('');
    };
    window.addEventListener('popstate', pop);
    window.addEventListener('message', message);
    window.addEventListener('suite:audit', audit);
    window.addEventListener('suite:logout', logout);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('message', message);
      window.removeEventListener('suite:audit', audit);
      window.removeEventListener('suite:logout', logout);
    };
  }, []);
  return (
    <div className={'suite ' + (view === 'audit' ? 'audit-theme' : '')}>
      <a className="skip-link" href="#suite-content">
        본문으로 이동
      </a>
      <header className="suite-header">
        <button className="suite-brand" onClick={() => navigate('compare')}>
          <BookOpen size={32} />
          <span>
            교실 도구함<small>기록과 글, 함께 살펴요</small>
          </span>
        </button>
        <nav className="suite-tabs" aria-label="도구 전환">
          <button
            aria-current={view !== 'audit' ? 'page' : undefined}
            className={view !== 'audit' ? 'selected compare-tab' : 'compare-tab'}
            onClick={() => navigate('compare')}
          >
            <ScanText size={18} />
            표절감사관 <span>유사도 검사</span>
          </button>
          <button
            aria-current={view === 'audit' ? 'page' : undefined}
            className={view === 'audit' ? 'selected audit-tab' : 'audit-tab'}
            onClick={() => navigate('audit')}
          >
            <ShieldCheck size={18} />
            생기부 감사관
          </button>
        </nav>
        <span className="suite-local">
          <i />
          {browserMode ? '내 브라우저에서 검사' : '로컬 작업 공간'}
        </span>
      </header>
      <div id="suite-content">
        <section hidden={view !== 'compare'} aria-label="표절감사관 빠른 비교">
          <QuickCompare
            active={view === 'compare'}
            incoming={incoming}
            notice={notice}
            clearNotice={() => setNotice('')}
            openWorkspace={() => navigate('workspace')}
          />
        </section>
        {workspaceLoaded && (
          <section
            hidden={view !== 'workspace'}
            className="suite-workspace"
            aria-label="표절감사관 문서 보관함"
          >
            <div className="workspace-banner">
              <button onClick={() => navigate('compare')}>
                <ArrowLeftRight size={16} />
                빠른 비교로
              </button>
              <span>{browserMode ? '공개 사이트 사용 안내' : '문서 보관함 · 검사 기록과 검토 내용을 이 컴퓨터에 저장합니다'}</span>
            </div>
            {browserMode ? <div className="ai-inspection">
              <h2>두 감사관을 한곳에서</h2>
              <p>글과 문서는 이 브라우저에서 분석합니다. 표절 비교는 직접 넣은 자료와 선택한 위키백과 공개자료를 사용합니다. AI 탐지는 모델을 내려받은 뒤 내 기기에서 실행합니다.</p>
              <p>입력한 글과 검사 결과는 새로고침하면 초기화됩니다. 결과 저장 버튼으로 JSON을 내려받거나 인쇄·PDF로 보관하세요.</p>
              <p>계정과 문서 보관함은 설치형 로컬 앱에서 제공합니다. 이 공개 사이트에서는 로그인과 서버 저장을 사용하지 않습니다.</p>
            </div> : <App />}
          </section>
        )}
        {auditorLoaded && (
          <section hidden={view !== 'audit'} className="auditor-panel" aria-label="생기부 감사관">
            <iframe
              key={frameKey}
              ref={frame}
              src={assetUrl('auditor/index.html?embedded=1')}
              title="생기부 감사관 작업 화면"
              className="auditor-frame"
            />
          </section>
        )}
      </div>
    </div>
  );
}

function QuickCompare({ active, incoming, notice, clearNotice, openWorkspace }) {
  const [aiReport, setAiReport] = useState(null);
  const [text, setText] = useState(''),
    [title, setTitle] = useState('빠른 비교 문서');
  const [sources, setSources] = useState([{ id: 1, title: '비교자료 1', text: '' }]);
  const [settings, setSettings] = useState({
    minWords: 6,
    excludeQuotes: true,
    excludeReferences: true,
    ignorePhrases: '',
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [report, setReport] = useState(null);
  const generation = useRef(0);
  const controller = useRef(null);
  const scheduled = useRef(null);
  const extraction = useRef({ generation: 0, controller: null });
  const [extracting, setExtracting] = useState(false);
  const [publicSearch, setPublicSearch] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    api('/quick/capabilities')
      .then((value) => {
        if (alive) {
          setCapabilities(value);
          setRevision((n) => n + 1);
        }
      })
      .catch(() => {
        if (alive) setCapabilities(null);
      });
    return () => {
      alive = false;
    };
  }, [active, incoming?.reset]);
  const targetFile = useRef(),
    sourceFiles = useRef(),
    resultRef = useRef();
  useEffect(() => {
    if (!incoming) return;
    generation.current++;
    controller.current?.abort();
    extraction.current.generation++;
    extraction.current.controller?.abort();
    setBusy(false);
    setExtracting(false);
    setText(incoming.text);
    setTitle(incoming.title || (incoming.reset ? '빠른 비교 문서' : '감사관에서 가져온 문서'));
    setReport(null);
    setError('');
    if (incoming.reset) {
      setPublicSearch(false);
      setCapabilities(null);
      setSources([{ id: 1, title: '비교자료 1', text: '' }]);
      setSettings({ minWords: 6, excludeQuotes: true, excludeReferences: true, ignorePhrases: '' });
    }
  }, [incoming]);
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
      extraction.current.generation++;
      extraction.current.controller?.abort();
    },
    [],
  );
  function changeSource(id, key, value) {
    setSources((previous) => previous.map((s) => (s.id === id ? { ...s, [key]: value } : s)));
    setReport(null);
  }
  async function extract(files, isTarget) {
    if (!files.length) return;
    if (!isTarget && files.length + sources.filter((s) => s.text.trim()).length > 20) {
      setError('비교자료는 합계 20개까지 추가할 수 있습니다. 기존 자료를 줄여 주세요.');
      return;
    }
    const requestId = ++extraction.current.generation;
    controller.current?.abort();
    extraction.current.controller?.abort();
    const abort = new AbortController();
    extraction.current.controller = abort;
    setExtracting(true);
    setBusy(false);
    setError('');
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append('files', file));
      const { documents } = await api('/quick/extract', {
        method: 'POST',
        body: form,
        signal: abort.signal,
      });
      if (extraction.current.generation !== requestId) return;
      if (isTarget) {
        setText(documents[0].text);
        setTitle(documents[0].title);
      } else
        setSources((previous) => [
          ...previous.filter((s) => s.text.trim()),
          ...documents.map((d, i) => ({ ...d, id: Date.now() + i })),
        ]);
      setReport(null);
    } catch (e) {
      if (extraction.current.generation === requestId && e.name !== 'AbortError')
        setError(e.message);
    } finally {
      if (extraction.current.generation === requestId) setExtracting(false);
    }
  }
  async function scan(scroll = false) {
    if (!text.trim() || extracting) return;
    clearTimeout(scheduled.current);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    clearNotice();
    const requestId = ++generation.current;
    try {
      const result = await api('/quick/scan', {
        method: 'POST',
        signal: abort.signal,
        body: {
          text,
          title,
          sources: sources.filter((s) => s.text.trim()),
          settings,
          publicSearch,
        },
      });
      if (generation.current !== requestId) return;
      setReport(result);
      setTimeout(() => {
        if (scroll && generation.current === requestId)
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e) {
      if (generation.current === requestId && e.name !== 'AbortError') setError(e.message);
    } finally {
      if (generation.current === requestId) setBusy(false);
    }
  }
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    setReport(null);
    setError('');
    setBusy(false);
    if (!text.trim() || extracting) return;
    const timer = setTimeout(() => scan(), 1000);
    scheduled.current = timer;
    return () => {
      clearTimeout(timer);
      generation.current++;
      controller.current?.abort();
    };
  }, [text, title, sources, settings, publicSearch, revision, extracting]);
  return (
    <main className="compare-main">
      <div className="compare-subnav">
        <span>
          <ScanText size={18} />
          표절감사관 · 근거로 읽는 글
        </span>
        <button className="btn" onClick={openWorkspace}>
          <FolderOpen size={17} />
          {browserMode ? '사용 안내' : '문서 보관함'}
          <ArrowRight size={16} />
        </button>
      </div>
      <section className="suite-arch">
        <span className="suite-arch-badge">선생님의 두 번째 눈</span>
        <h1>
          닮은 문장을 찾는
          <br />
          표절감사관
        </h1>
        <p>
          수행평가부터 생기부, 연구 보고서까지.
          <br />
          겹치는 문장과 비교 근거를 나란히 확인하세요.
        </p>
        <span className="suite-arch-tag">모든 글의 유사도 검사</span>
      </section>
      <div className="compare-home-grid">
        <figure className="compare-art">
          <img src={assetUrl('suite-cover.svg')} alt="펼친 책 위의 학교와 교과 도구를 그린 청록색 선화" />
          <figcaption>같은 주제에도, 각자의 생각이 담기도록.</figcaption>
          <div className="compare-art-note">
            <LockKeyhole size={17} />
            <span>
              빠른 비교는 문서를 보관하지 않습니다.
              <br />
              기본 검사는 이 컴퓨터에서 처리됩니다. 공개자료 검색을 켜면 검색어만 외부로 전송됩니다.
            </span>
          </div>
        </figure>
        <form
          className="compare-form"
          onSubmit={(event) => {
            event.preventDefault();
            scan(true);
          }}
        >
          <fieldset disabled={extracting} className="compare-fieldset">
            <div className="compare-form-head">
              <div>
                <span className="suite-pill">바로 시작하기</span>
                <h2>어떤 글을 살펴볼까요?</h2>
              </div>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setText(demoText);
                  setTitle('산업 혁명 탐구 — 가상 예제');
                  setSources([
                    { id: 1, title: '산업 혁명 수업자료 — 가상 예제', text: demoSource },
                  ]);
                  setReport(null);
                  setError('');
                }}
              >
                예제로 체험
              </button>
            </div>
            {notice && (
              <div className="suite-notice" role="status">
                {notice}
              </div>
            )}
            <label className="compare-field">
              검사할 글
              <input
                aria-label="문서 제목"
                value={title}
                maxLength={150}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setReport(null);
                }}
              />
              <textarea
                aria-label="검사할 글"
                placeholder="검사할 원문을 붙여 넣으세요. 파일도 불러올 수 있어요."
                rows={6}
                value={text}
                maxLength={60000}
                required
                onChange={(e) => {
                  setText(e.target.value);
                  setReport(null);
                }}
              />
            </label>
            <div className="compare-field-foot">
              <button type="button" className="text-btn" onClick={() => targetFile.current.click()}>
                <FileUp size={15} />
                원문 파일 불러오기
              </button>
              <span>{text.length.toLocaleString()} / 60,000자</span>
            </div>
            <input
              ref={targetFile}
              type="file"
              hidden
              accept=".txt,.md,.csv,.docx,.hwpx,.pdf"
              onChange={(e) => {
                extract(e.target.files, true);
                e.target.value = '';
              }}
            />
            <div className="auto-check-panel">
              <strong>
                <ScanText size={17} /> 글을 넣으면 자동 검사
              </strong>
              <p>
                입력을 멈추면 1초 뒤 검사합니다.{' '}
                {capabilities?.authenticated
                  ? `보관함의 접근 가능한 자료 ${capabilities.localDocuments}개를 자동 대조합니다.`
                  : browserMode ? '직접 추가한 자료와 선택한 공개자료를 브라우저에서 대조합니다.' : '보관함 자료를 자동 대조하려면 문서 보관함에서 로그인하세요.'}
              </p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={publicSearch}
                  onChange={(e) => setPublicSearch(e.target.checked)}
                />
                위키백과 공개자료도 찾아 비교
              </label>
              <small>
                켜면 본문에 등장한 사전 지정 학술 주제어를 위키백과에 보냅니다. 최대 4개 자료를
                비교하며, 인터넷 전체·논문 DB 검색은 아닙니다.
              </small>
            </div>
            <details className="manual-sources">
              <summary>
                비교자료 직접 추가{' '}
                <span>선택 · {sources.filter((s) => s.text.trim()).length}개</span>
              </summary>
              <div className="compare-source-heading">
                <h3>
                  비교할 자료 <span>{sources.length}</span>
                </h3>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => sourceFiles.current.click()}
                >
                  <FileUp size={15} />
                  파일 추가
                </button>
              </div>
              <input
                ref={sourceFiles}
                type="file"
                hidden
                multiple
                accept=".txt,.md,.csv,.docx,.hwpx,.pdf"
                onChange={(e) => {
                  extract(e.target.files, false);
                  e.target.value = '';
                }}
              />
              <p className="compare-hint">다른 학생의 글, 수업자료, 출처 원문을 넣어 주세요.</p>
              {sources.map((s, i) => (
                <div className="compare-source" key={s.id}>
                  <div>
                    <input
                      aria-label={`비교자료 ${i + 1} 제목`}
                      value={s.title}
                      maxLength={150}
                      onChange={(e) => changeSource(s.id, 'title', e.target.value)}
                    />
                    {sources.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`비교자료 ${i + 1} 삭제`}
                        onClick={() => {
                          setSources(sources.filter((x) => x.id !== s.id));
                          setReport(null);
                        }}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>
                  <textarea
                    aria-label={`비교자료 ${i + 1} 본문`}
                    rows={3}
                    value={s.text}
                    placeholder="대조할 자료의 본문을 붙여 넣으세요."
                    maxLength={60000}
                    onChange={(e) => changeSource(s.id, 'text', e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                className="compare-add"
                disabled={sources.length >= 20}
                onClick={() =>
                  setSources([
                    ...sources,
                    { id: Date.now(), title: `비교자료 ${sources.length + 1}`, text: '' },
                  ])
                }
              >
                <Plus size={16} />
                비교자료 추가 <span>최대 20개</span>
              </button>
            </details>
            <details className="compare-settings">
              <summary>
                검사 기준 조정 <span>기본 {settings.minWords}어절 연속 일치</span>
              </summary>
              <label>
                연속 일치 기준
                <select
                  value={settings.minWords}
                  onChange={(e) => {
                    setSettings({ ...settings, minWords: Number(e.target.value) });
                    setReport(null);
                  }}
                >
                  {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => (
                    <option value={n} key={n}>
                      {n}어절
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.excludeQuotes}
                  onChange={(e) => {
                    setSettings({ ...settings, excludeQuotes: e.target.checked });
                    setReport(null);
                  }}
                />
                따옴표로 표시한 인용문 제외
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={settings.excludeReferences}
                  onChange={(e) => {
                    setSettings({ ...settings, excludeReferences: e.target.checked });
                    setReport(null);
                  }}
                />
                참고문헌 제목 아래 내용 제외
              </label>
              <label>
                제외할 공통 문구
                <textarea
                  value={settings.ignorePhrases}
                  rows={2}
                  placeholder="과제 안내문 등, 한 줄에 하나씩"
                  onChange={(e) => {
                    setSettings({ ...settings, ignorePhrases: e.target.value });
                    setReport(null);
                  }}
                />
              </label>
            </details>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn primary full compare-submit"
              disabled={busy || extracting || !text.trim()}
            >
              {busy ? <Spinner /> : <ScanText size={20} />}{' '}
              {extracting
                ? '문서를 읽고 있어요'
                : busy
                  ? '문장과 근거를 비교하고 있어요'
                  : '지금 다시 검사'}
              <ArrowRight size={18} />
            </button>
            <div className="auto-check-status" role="status" aria-live="polite">
              {report ? (
                <>
                  <span>
                    {report.evidence?.status === 'insufficient'
                      ? '검사 근거 부족 · 비교할 자료를 추가해 주세요'
                      : `자동 검사 완료 · 자료 ${report.sourceCount}개 비교`}
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => resultRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    결과 보기 ↓
                  </button>
                </>
              ) : text.trim() ? (
                busy ? (
                  '사용 가능한 자료와 비교 중입니다.'
                ) : extracting ? (
                  '파일에서 본문을 추출 중입니다.'
                ) : error ? (
                  '검사를 완료하지 못했습니다.'
                ) : (
                  '입력을 마치면 자동으로 검사합니다.'
                )
              ) : (
                '글을 붙여 넣거나 원문 파일을 불러오세요.'
              )}
            </div>
            <p className="compare-bottom-note">
              TXT · DOCX · HWPX · 텍스트 PDF 지원 · 파일당 10MB
              <br />
              도구 전환 중 입력 유지 · 새로고침 시 초기화
              <br />
              출처 비교 결과와 AI 작성 탐지 결과는 아래에 따로 표시합니다.
            </p>
          </fieldset>
        </form>
      </div>
      <AiInspection
        text={extracting ? '' : text}
        title={title}
        resetKey={incoming?.nonce}
        onResult={setAiReport}
      />
      <section className="compare-legend" aria-label="검사 안내">
        <article>
          <span className="legend-symbol exact">가</span>
          <div>
            <h3>연속 일치</h3>
            <p>
              실제로 겹친 어절을 세고
              <br />
              일치율에 반영합니다.
            </p>
          </div>
        </article>
        <article>
          <span className="legend-symbol similar">≈</span>
          <div>
            <h3>변형 문장 후보</h3>
            <p>
              띄어쓰기·일부 표현을 바꾼
              <br />
              문장을 따로 보여 드립니다.
            </p>
          </div>
        </article>
        <article>
          <ShieldCheck size={27} />
          <div>
            <h3>판단은 근거와 함께</h3>
            <p>
              유사도는 표절 판정이 아닙니다.
              <br />
              출처와 맥락을 확인해 주세요.
            </p>
          </div>
        </article>
      </section>
      {report && (
        <section ref={resultRef} className="quick-result" aria-label="빠른 비교 결과">
          <div className="suite-notice">
            <Info size={16} />
            이번 결과는 자동 저장되지 않습니다. 결과 저장 또는 인쇄·PDF로 남길 수 있어요.
          </div>
          <Report
            initialReport={report}
            aiReport={aiReport}
            user={{ role: 'student' }}
            notify={(message) => setError(message)}
            onBack={() => {
              setReport(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </section>
      )}
      <footer className="suite-footer">
        <strong>표절감사관 × 생기부 감사관</strong>
        <span>하나의 도구함, 두 가지 꼼꼼한 시선.</span>
        <button className="text-btn" onClick={openWorkspace}>
          {browserMode ? '공개 사이트 사용 안내' : '여러 문서와 검사 기록 관리하기'}
          <ArrowRight size={15} />
        </button>
      </footer>
    </main>
  );
}
