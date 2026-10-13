import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  LayoutDashboard,
  ScanText,
  BookOpen,
  FolderOpen,
  Library,
  Users,
  Settings2,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  Bell,
  ArrowUpRight,
  FileText,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  PanelLeftClose,
  LogOut,
  MoreHorizontal,
  Download,
  SlidersHorizontal,
  ArrowRight,
  Layers3,
  GraduationCap,
  CircleHelp,
  X,
  AlertCircle,
  Database,
  LockKeyhole,
  WifiOff,
  ClipboardList,
} from 'lucide-react';
import { api, post, download, csvCell, when, kinds, roles } from './api.js';
import {
  Auth,
  Brand,
  Empty,
  Badge,
  Spinner,
  Modal,
  UploadModal,
  ScanModal,
  GroupModal,
} from './components.jsx';
import Report from './Report.jsx';
import { DocumentManager, PasswordForm } from './DocumentManager.jsx';

const nav = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'all', label: '전체 문서', icon: FolderOpen },
  { id: 'assignment', label: '수행평가 검사', icon: ScanText },
  { id: 'record', label: '생기부·세특 점검', icon: BookOpen },
  { id: 'research', label: '연구·일반 문서', icon: GraduationCap },
  { id: 'reports', label: '검사 기록', icon: ClipboardList },
  { id: 'archive', label: '보관 문서', icon: FolderOpen },
];

export default function App() {
  const authGeneration = useRef(0);
  const previewGeneration = useRef(0);
  const renderGeneration = authGeneration.current;
  const [session, setSession] = useState(null),
    [data, setData] = useState({ documents: [], groups: [], users: [], audit: [], reports: [] });
  const [page, setPage] = useState('dashboard'),
    [reportId, setReportId] = useState(null),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState('all');
  const [selected, setSelected] = useState(new Set()),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(null),
    [sideOpen, setSideOpen] = useState(false),
    [fatal, setFatal] = useState('');
  const [scanDocs, setScanDocs] = useState([]),
    [preview, setPreview] = useState(null),
    [status, setStatus] = useState('all');
  const notify = (text, error = false) => {
    if (renderGeneration === authGeneration.current) setToast({ text, error });
  };
  async function loadData() {
    if (renderGeneration !== authGeneration.current) return null;
    const next = await api('/state');
    if (renderGeneration !== authGeneration.current) return null;
    setData(next);
    return next;
  }
  async function loadSession() {
    const generation = ++authGeneration.current;
    const s = await api('/session');
    const next = s.user
      ? await api('/state')
      : { documents: [], groups: [], users: [], audit: [], reports: [] };
    if (generation !== authGeneration.current) return;
    setData(next);
    setReportId(null);
    setPreview(null);
    setSelected(new Set());
    setModal(null);
    setPage('dashboard');
    setGroup('all');
    setQuery('');
    setStatus('all');
    setSession(s);
  }
  useEffect(() => {
    loadSession().catch((e) => setFatal(e.message));
    return () => {
      authGeneration.current++;
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function navigate(next, groupId = 'all') {
    previewGeneration.current++;
    setPreview(null);
    setPage(next);
    setGroup(groupId);
    setReportId(null);
    setQuery('');
    setStatus('all');
    setSelected(new Set());
    setSideOpen(false);
  }
  const user = session?.user;
  const allDocs = data.documents.filter((d) => !d.reference && !d.archived);
  const filtered = useMemo(
    () =>
      data.documents.filter((d) => {
        if (page === 'archive')
          return (
            d.archived &&
            (!query || (d.title + d.author).toLowerCase().includes(query.toLowerCase())) &&
            (group === 'all' || d.groupId === group)
          );
        if (d.archived) return false;
        if (page === 'library' ? !d.reference : d.reference) return false;
        if (['assignment', 'record', 'research'].includes(page) && d.kind !== page) return false;
        if (group !== 'all' && d.groupId !== group) return false;
        if (query && !(d.title + d.author).toLowerCase().includes(query.toLowerCase()))
          return false;
        if (status === 'waiting' && d.latest && !d.latest.stale) return false;
        if (status === 'review' && (!d.latest || d.latest.reviewed >= d.latest.matches))
          return false;
        if (
          status === 'done' &&
          (!d.latest || d.latest.stale || d.latest.reviewed < d.latest.matches)
        )
          return false;
        return true;
      }),
    [data, page, group, query, status],
  );
  const checked = filtered.filter((d) => selected.has(d.id));
  async function openDoc(d) {
    if (d.latest && !d.reference) {
      setReportId(d.latest.id);
      return;
    }
    await openPreview(d);
  }
  async function openPreview(d) {
    const generation = authGeneration.current;
    const request = ++previewGeneration.current;
    try {
      const doc = await api('/documents/' + d.id);
      if (generation === authGeneration.current && request === previewGeneration.current)
        setPreview(doc);
    } catch (e) {
      notify(e.message, true);
    }
  }
  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function startScan(docs) {
    docs = docs.filter((d) => !d.archived && !d.reference);
    if (!docs.length) {
      notify('검사할 문서를 먼저 선택해 주세요.', true);
      return;
    }
    if (docs.length > 40) {
      notify('한 번에 40개까지 검사할 수 있습니다.', true);
      return;
    }
    setScanDocs(docs);
    setModal('scan');
  }
  function exportCsv(docs) {
    const rows = [
      ['문서명', '작성자', '유형', '일치율(%)', '비교문서수', '검사일'],
      ...docs.map((d) => [
        d.title,
        d.author,
        kinds[d.kind],
        d.latest?.score ?? '',
        d.latest?.sourceCount ?? '',
        d.latest?.createdAt ?? '',
      ]),
    ];
    download(
      '표절감사관-문서목록.csv',
      '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  if (fatal)
    return (
      <Empty
        title="서버에 연결하지 못했습니다"
        text={fatal}
        action={
          <button className="btn" onClick={() => window.location.reload()}>
            다시 연결
          </button>
        }
      />
    );
  if (!session)
    return (
      <div className="loading full-height">
        <Spinner />
        표절감사관을 준비하고 있어요
      </div>
    );
  if (!user) return <Auth session={session} onLogin={loadSession} />;
  const scanned = allDocs.filter((d) => d.latest && !d.latest.stale),
    waiting = allDocs.filter((d) => !d.latest || d.latest.stale),
    review = scanned.filter((d) => d.latest.reviewed < d.latest.matches);
  const title =
    page === 'library'
      ? '참고자료실'
      : page === 'members'
        ? '학교 구성원'
        : page === 'settings'
          ? '작업 공간 안내'
          : nav.find((n) => n.id === page)?.label;
  const descriptions = {
    all: '모든 글을 한곳에서, 문서마다 필요한 검토를 이어가세요.',
    assignment: '학생의 탐구를 읽고, 문장마다 근거를 확인하세요.',
    record: '반복되는 표현을 살피고, 학생의 고유한 활동을 드러내세요.',
    research: '연구 보고서와 일반 문서의 출처를 차근차근 확인하세요.',
    library: '수업 자료와 출처 원문을 모아 비교의 범위를 넓히세요.',
    reports: '검사 시점의 원문과 설정, 검토 기록을 다시 확인하세요.',
    members: '학교 구성원의 계정과 역할을 관리하세요.',
    archive: '보관 문서는 비교 대상에서 제외됩니다. 원문·관리에서 언제든 복원할 수 있어요.',
  };
  function documentTable(docs, compact = false) {
    return docs.length ? (
      <div className="table-scroll">
        <table className="document-table">
          <thead>
            <tr>
              {!compact && page !== 'library' && page !== 'archive' && (
                <th className="checkbox-cell">
                  <input
                    aria-label="표시된 문서 전체 선택"
                    type="checkbox"
                    checked={docs.every((d) => selected.has(d.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(docs.map((d) => d.id)) : new Set())
                    }
                  />
                </th>
              )}
              <th>문서명</th>
              <th>작성자</th>
              <th>{page === 'library' ? '등록일' : '검사 결과'}</th>
              <th>상태</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                {!compact && page !== 'library' && page !== 'archive' && (
                  <td className="checkbox-cell">
                    <input
                      aria-label={`${d.title} 선택`}
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                    />
                  </td>
                )}
                <td>
                  <button className="document-link" onClick={() => openDoc(d)}>
                    <span
                      className={
                        'file-icon ' + (d.kind === 'record' ? 'mint' : d.reference ? 'violet' : '')
                      }
                    >
                      <FileText size={20} />
                    </span>
                    <span>
                      <strong>{d.title}</strong>
                      <small>
                        {kinds[d.kind]} <span className="dot-sep">/</span>{' '}
                        {d.characters.toLocaleString()}자{' '}
                        {d.sample && <span className="sample-tag">예제</span>}
                      </small>
                    </span>
                  </button>
                  <div className="lifecycle-controls">
                    <button onClick={() => openPreview(d)}>원문·관리</button>
                    {d.latest?.stale && (
                      <span className="status-text amber">원문 수정됨 · 재검사 필요</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="author-name">{d.author || '—'}</span>
                </td>
                <td>
                  {d.reference ? (
                    <span className="muted">{when(d.createdAt)}</span>
                  ) : d.latest ? (
                    <Badge score={d.latest.score} noSources={!d.latest.sourceCount} />
                  ) : (
                    <span className="muted">아직 검사 전</span>
                  )}
                </td>
                <td>
                  {d.archived ? (
                    <span className="status-text gray">보관 중</span>
                  ) : d.latest?.stale ? (
                    <span className="status-text amber">재검사 필요</span>
                  ) : d.reference ? (
                    <span className="status-text teal">
                      <CheckCircle2 size={13} />
                      비교 가능
                    </span>
                  ) : !d.latest ? (
                    <span className="status-text gray">
                      <Clock3 size={13} />
                      검사 대기
                    </span>
                  ) : d.latest.reviewed < d.latest.matches ? (
                    <span className="status-text amber">
                      <span className="status-dot" />
                      검토 필요
                    </span>
                  ) : (
                    <span className="status-text teal">
                      <CheckCircle2 size={13} />
                      검토 완료
                    </span>
                  )}
                </td>
                <td>
                  {d.archived ? (
                    <button className="row-action" onClick={() => openPreview(d)}>
                      복원·관리
                      <ChevronRight size={13} />
                    </button>
                  ) : d.reference ? (
                    <button
                      className="icon-btn"
                      aria-label={`${d.title} 열기`}
                      onClick={() => openDoc(d)}
                    >
                      <ChevronRight size={17} />
                    </button>
                  ) : (
                    <button
                      className="row-action"
                      onClick={() =>
                        d.latest && !d.latest.stale ? setReportId(d.latest.id) : startScan([d])
                      }
                    >
                      {d.latest?.stale ? '재검사' : d.latest ? '결과 보기' : '검사하기'}
                      <ChevronRight size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title={
          page === 'archive'
            ? '보관 중인 문서가 없습니다'
            : page === 'library'
              ? '비교할 참고자료를 모아 보세요'
              : query || status !== 'all'
                ? '조건에 맞는 문서가 없습니다'
                : '첫 번째 문서를 기다리고 있어요'
        }
        text={
          page === 'archive'
            ? '문서의 원문·관리에서 보관 처리할 수 있습니다.'
            : query || status !== 'all'
              ? '검색어나 필터를 바꿔 보세요.'
              : '문서를 등록하면 일치 구간과 비교 근거를 확인할 수 있어요.'
        }
        action={
          page !== 'archive' &&
          !(query || status !== 'all') &&
          (page !== 'library' || user.role !== 'student') ? (
            <button
              className="btn primary"
              onClick={() => setModal(page === 'library' ? 'reference' : 'upload')}
            >
              <Plus size={16} />
              문서 등록
            </button>
          ) : null
        }
      />
    );
  }
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (sideOpen ? 'open' : '')}>
        <Brand />
        <button className="workspace-switch" onClick={() => navigate('settings')}>
          <span className="school-avatar">
            <GraduationCap size={20} />
          </span>
          <span>
            <b>{session.school}</b>
            <small>학교 작업 공간</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">작업 공간</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id && !reportId ? 'active' : ''}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === 'all' && <small>{allDocs.length}</small>}
              {id === 'dashboard' && page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label">학교 자료와 관리</div>
        <nav>
          <button
            className={page === 'library' ? 'active' : ''}
            onClick={() => navigate('library')}
          >
            <Library size={18} />
            <span>참고자료실</span>
          </button>
          {user.role === 'admin' && (
            <button
              className={page === 'members' ? 'active' : ''}
              onClick={() => navigate('members')}
            >
              <Users size={18} />
              <span>학교 구성원</span>
            </button>
          )}
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={18} />
            <span>작업 공간 안내</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <b>우리 학교 안에서, 안전하게</b>
              <p>문서는 내 컴퓨터에 보관돼요.</p>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <b>{user.name}</b>
              <small>{roles[user.role]}</small>
            </div>
            <button
              className="icon-btn"
              title="로그아웃"
              aria-label="로그아웃"
              onClick={async () => {
                authGeneration.current++;
                setData({ documents: [], groups: [], users: [], audit: [], reports: [] });
                setSession(null);
                setPreview(null);
                setModal(null);
                setToast(null);
                window.dispatchEvent(new Event('suite:logout'));
                try {
                  await post('/logout', {});
                  setReportId(null);
                  setSelected(new Set());
                  await loadSession();
                } catch (e) {
                  await loadSession().catch((error) => setFatal(error.message));
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {sideOpen && (
        <button
          className="mobile-overlay"
          aria-label="메뉴 닫기"
          onClick={() => setSideOpen(false)}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setSideOpen(true)}
            >
              <PanelLeftClose size={20} />
            </button>
            <span>우리 학교</span>
            <ChevronRight size={13} />
            <b>{reportId ? '검사 결과' : title}</b>
          </div>
          <div className="top-actions">
            <span className="local-tag">
              <span />
              로컬 작업 공간
            </span>
            <button className="icon-btn" aria-label="도움말" onClick={() => navigate('settings')}>
              <CircleHelp size={19} />
            </button>
            <span className="top-avatar">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <div className={'main-content ' + (reportId ? 'report-content' : '')}>
          {reportId ? (
            <Report
              id={reportId}
              onBack={() => setReportId(null)}
              user={user}
              notify={notify}
              onUpdated={loadData}
            />
          ) : page === 'dashboard' ? (
            <>
              <div className="page-heading">
                <div>
                  <p className="date-line">
                    {new Date().toLocaleDateString('ko-KR', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long',
                    })}
                  </p>
                  <h1>{user.name}님, 오늘도 좋은 글을 만나세요.</h1>
                  <p>문장의 닮음을 살피고, 학생의 생각을 더 깊이 읽는 시간.</p>
                </div>
                <button className="btn primary" onClick={() => setModal('upload')}>
                  <Plus size={18} />
                  문서 등록
                </button>
              </div>
              <section className="welcome-panel">
                <div>
                  <span className="welcome-label">
                    <ScanText size={16} />
                    근거로 시작하는 꼼꼼한 검토
                  </span>
                  <h2>
                    글의 결과보다,
                    <br />
                    생각의 과정을 발견하세요.
                  </h2>
                  <p>
                    수행평가와 생기부, 연구 문서를 한곳에서 비교하고
                    <br className="desktop-br" />
                    확인한 근거와 검토 기록을 함께 남기세요.
                  </p>
                  <button
                    className="btn dark"
                    onClick={() =>
                      waiting.length ? startScan(waiting.slice(0, 40)) : setModal('upload')
                    }
                  >
                    {waiting.length
                      ? `대기 문서 ${Math.min(waiting.length, 40)}개 검사하기`
                      : '새 문서로 시작하기'}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="art-doc art-back">
                    <span />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="art-doc art-front">
                    <div>
                      <span className="tiny-square" />
                      문장별 근거 대조
                    </div>
                    <i />
                    <i />
                    <em />
                    <i />
                    <em className="mint" />
                    <i />
                    <small>
                      <CheckCircle2 size={14} />
                      문맥까지 함께 읽기
                    </small>
                  </div>
                  <div className="art-check">
                    <ShieldCheck size={25} />
                  </div>
                </div>
              </section>
              <section className="stats-strip">
                <div>
                  <span className="stat-icon blue">
                    <FileText size={21} />
                  </span>
                  <div>
                    <p>전체 문서</p>
                    <strong>
                      {allDocs.length}
                      <small>개</small>
                    </strong>
                  </div>
                  <span className="stat-meta">{data.groups.length}개 검사함</span>
                </div>
                <div>
                  <span className="stat-icon violet">
                    <ScanText size={21} />
                  </span>
                  <div>
                    <p>검사 완료</p>
                    <strong>
                      {scanned.length}
                      <small>개</small>
                    </strong>
                  </div>
                  <span className="stat-meta">근거 확인 가능</span>
                </div>
                <div>
                  <span className="stat-icon amber">
                    <MessageIcon />
                  </span>
                  <div>
                    <p>검토가 필요한 문서</p>
                    <strong>
                      {review.length}
                      <small>개</small>
                    </strong>
                  </div>
                  <button
                    className="stat-link"
                    onClick={() => {
                      navigate('all');
                      setStatus('review');
                    }}
                    aria-label="검토 필요한 문서 보기"
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </div>
                <div>
                  <span className="stat-icon teal">
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <p>검사 대기</p>
                    <strong>
                      {waiting.length}
                      <small>개</small>
                    </strong>
                  </div>
                  <button
                    className="stat-link"
                    onClick={() => {
                      navigate('all');
                      setStatus('waiting');
                    }}
                    aria-label="검사 대기 문서 보기"
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </div>
              </section>
              <div className="dashboard-columns">
                <div className="dashboard-main">
                  <section className="section-block">
                    <div className="section-heading">
                      <h2>
                        내 검사함 <span className="count">{data.groups.length}</span>
                      </h2>
                      {user.role !== 'student' && (
                        <button className="text-btn" onClick={() => setModal('group')}>
                          <Plus size={15} />새 검사함
                        </button>
                      )}
                    </div>
                    <div className="group-grid">
                      {data.groups.slice(0, 4).map((g) => {
                        const docs = allDocs.filter((d) => d.groupId === g.id);
                        const done = docs.filter((d) => d.latest && !d.latest.stale).length;
                        return (
                          <button
                            className="group-card"
                            key={g.id}
                            onClick={() => navigate(g.kind, g.id)}
                          >
                            <div>
                              <span className={'group-icon ' + (g.kind === 'record' ? 'mint' : '')}>
                                {g.kind === 'record' ? (
                                  <BookOpen size={21} />
                                ) : (
                                  <FolderOpen size={21} />
                                )}
                              </span>
                              <ChevronRight size={16} />
                            </div>
                            <span className="group-kind">{kinds[g.kind]}</span>
                            <h3>{g.name}</h3>
                            <div className="group-progress">
                              <span>문서 {docs.length}개</span>
                              <small>{done}개 검사 완료</small>
                            </div>
                            <div className="progress-track">
                              <i
                                style={{
                                  width: `${docs.length ? (done / docs.length) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="section-block table-panel">
                    <div className="section-heading">
                      <h2>최근 문서</h2>
                      <button className="text-btn" onClick={() => navigate('all')}>
                        전체 보기
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    {documentTable(allDocs.slice(0, 5), true)}
                  </section>
                </div>
                <aside className="dashboard-side">
                  <section className="guide-card">
                    <span className="guide-icon">
                      <BookOpen size={21} />
                    </span>
                    <h3>
                      숫자 다음에는,
                      <br />
                      문장의 맥락을 읽어 주세요.
                    </h3>
                    <p>
                      일치율은 검토의 시작점입니다. 인용 여부, 공통 표현, 학생의 실제 탐구 과정을
                      함께 확인하세요.
                    </p>
                    <button className="text-btn" onClick={() => navigate('settings')}>
                      검사 결과 읽는 법<ArrowRight size={15} />
                    </button>
                  </section>
                  <section className="activity-panel">
                    <div className="section-heading">
                      <h3>최근 활동</h3>
                      <Clock3 size={16} />
                    </div>
                    {data.audit.length ? (
                      data.audit.slice(0, 4).map((a) => (
                        <div className="activity" key={a.id}>
                          <span className="activity-dot" />
                          <div>
                            <b>{a.action}</b>
                            <p>{a.target}</p>
                            <small>
                              {a.name} · {when(a.createdAt)}
                            </small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="activity-empty">
                        <span>첫 기록을 기다리고 있어요.</span>
                        <p>
                          문서를 등록하고 검사를 시작하면
                          <br />
                          작업 이력이 이곳에 남습니다.
                        </p>
                      </div>
                    )}
                  </section>
                  <div className="coverage-note">
                    <Database size={17} />
                    <p>
                      <b>비교 범위가 투명한 검사</b>
                      <br />
                      등록된 문서만 비교합니다.
                      <br />
                      인터넷 검색·AI 탐지는 미연결 상태입니다.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : page === 'settings' ? (
            <Settings notify={notify} />
          ) : page === 'members' ? (
            <Members users={data.users} notify={notify} reload={loadData} />
          ) : page === 'reports' ? (
            <>
              <PageHeading title={title} description={descriptions[page]} />
              <section className="table-panel">
                {data.reports.length ? (
                  <div className="table-scroll">
                    <table className="document-table">
                      <thead>
                        <tr>
                          <th>문서명</th>
                          <th>검사일</th>
                          <th>일치율</th>
                          <th>비교 문서</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.reports.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <b>{r.title}</b>
                            </td>
                            <td>{new Date(r.createdAt).toLocaleString('ko-KR')}</td>
                            <td>
                              <Badge score={r.score} noSources={!r.sourceCount} />
                            </td>
                            <td>{r.sourceCount}개</td>
                            <td>
                              <button className="row-action" onClick={() => setReportId(r.id)}>
                                결과 보기
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="아직 검사 기록이 없습니다"
                    text="문서를 검사하면 시점별 결과가 이곳에 쌓입니다."
                  />
                )}
              </section>
            </>
          ) : (
            <>
              <PageHeading
                title={title}
                description={descriptions[page]}
                action={
                  (page !== 'library' || user.role !== 'student') && (
                    <button
                      className="btn primary"
                      onClick={() => setModal(page === 'library' ? 'reference' : 'upload')}
                    >
                      <Plus size={17} />
                      {page === 'library' ? '참고자료 등록' : '문서 등록'}
                    </button>
                  )
                }
              />
              {page === 'record' && (
                <div className="notice record-notice">
                  <BookOpen size={23} />
                  <div>
                    <b>학생마다 다른 활동이 문장에 드러나도록</b>
                    <p>
                      검사 설정에서 반복되는 공통 문구를 제외해 보세요. 문장의 중복을 확인하는
                      기능이며 생기부 기재 규정이나 활동의 사실 여부를 판정하지 않습니다.
                    </p>
                  </div>
                </div>
              )}
              <section className="table-panel">
                <div className="document-controls">
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      aria-label="문서 검색"
                      placeholder="문서명 또는 작성자 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="검사함 필터"
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                  >
                    <option value="all">전체 검사함</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <button className="btn" onClick={() => exportCsv(filtered)}>
                    <Download size={16} />
                    목록 저장
                  </button>
                </div>
                {page !== 'library' && page !== 'archive' && (
                  <div className="list-tabs">
                    <div>
                      {[
                        ['all', '전체'],
                        ['waiting', '검사 대기'],
                        ['review', '검토 필요'],
                        ['done', '검토 완료'],
                      ].map(([key, name]) => (
                        <button
                          key={key}
                          className={status === key ? 'active' : ''}
                          onClick={() => setStatus(key)}
                        >
                          {name}
                          {key === 'all' && <span>{filtered.length}</span>}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn small primary"
                      onClick={() =>
                        startScan(
                          checked.length
                            ? checked
                            : filtered.filter((d) => !d.latest || d.latest.stale),
                        )
                      }
                    >
                      {checked.length ? `${checked.length}개 선택 검사` : '대기 문서 검사'}
                      <ScanText size={15} />
                    </button>
                  </div>
                )}
                {documentTable(filtered)}
                <div className="table-footer">
                  <span>
                    {filtered.length}개 문서{checked.length > 0 && ` · ${checked.length}개 선택`}
                  </span>
                  <span>문서당 최대 60,000자</span>
                </div>
              </section>
            </>
          )}
          <footer className="app-footer">
            <Brand />
            <span>좋은 글을 향한, 근거 있는 한 걸음.</span>
            <span>표절감사관 0.2 · 교실 도구함</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className={'toast ' + (toast.error ? 'error-toast' : '')} role="status">
          {toast.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.text}</span>
          <button className="icon-btn" aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {['upload', 'reference'].includes(modal) && (
        <UploadModal
          groups={data.groups}
          defaultGroup={group !== 'all' ? group : data.groups.find((g) => g.kind === page)?.id}
          reference={modal === 'reference'}
          isStudent={user.role === 'student'}
          onClose={() => setModal(null)}
          onDone={async () => {
            await loadData();
            notify('문서를 등록했습니다. 검사할 문서를 선택해 주세요.');
          }}
        />
      )}{' '}
      {modal === 'group' && (
        <GroupModal
          initialKind={['assignment', 'record', 'research'].includes(page) ? page : 'assignment'}
          onClose={() => setModal(null)}
          onDone={loadData}
        />
      )}{' '}
      {modal === 'scan' && (
        <ScanModal
          documents={scanDocs}
          onClose={() => setModal(null)}
          run={(body) => post('/scan', body)}
          onDone={async (results) => {
            if (renderGeneration !== authGeneration.current) return;
            await loadData();
            if (renderGeneration !== authGeneration.current) return;
            setModal(null);
            setSelected(new Set());
            if (results.length === 1) setReportId(results[0].id);
            else navigate('all');
            notify(`${results.length}개 문서 검사를 완료했습니다.`);
          }}
        />
      )}{' '}
      {preview && (
        <DocumentManager
          key={preview.id}
          document={preview}
          user={user}
          onClose={() => setPreview(null)}
          onChanged={loadData}
          notify={notify}
          onScan={(doc) => {
            startScan([doc]);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
function MessageIcon() {
  return <ClipboardList size={21} />;
}
function PageHeading({ title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Settings({ notify }) {
  return (
    <>
      <PageHeading
        title="작업 공간 안내"
        description="무엇을 확인했고, 무엇을 확인하지 않았는지 투명하게."
      />
      <div className="settings-grid">
        <PasswordForm notify={notify} />
        <section className="settings-card">
          <ShieldCheck size={27} />
          <h2>검사 결과를 읽는 방법</h2>
          <dl>
            <dt>어절 일치율</dt>
            <dd>
              제외 조건을 적용한 어절 중 연속 일치한 어절의 비율입니다. 여러 출처에 겹치는 구간은 한
              번만 계산합니다.
            </dd>
            <dt>문장 유사 후보</dt>
            <dd>
              정규화한 문자 구간과 문자 묶음·순서로 찾은 유사 문장입니다. 의미의 동일성이나 AI 작성
              가능성을 뜻하지 않으며 일치율에 더하지 않습니다.
            </dd>
            <dt>인용 확인·제외</dt>
            <dd>
              교사가 인용이나 공통 표현임을 확인한 근거를 제외합니다. 다른 출처와 겹치는 근거가
              남으면 해당 어절은 계속 계산됩니다.
            </dd>
            <dt>판단을 위한 근거</dt>
            <dd>
              수치만으로 표절, 부정행위, AI 작성을 확정하지 않습니다. 초안·출처·수업 중 활동과 학생
              설명을 함께 살펴보세요.
            </dd>
          </dl>
        </section>
        <section className="settings-card">
          <Database size={27} />
          <h2>현재 제공 범위</h2>
          <div className="capability">
            <span>등록 문서·참고자료 대조</span>
            <span className="badge teal">사용 가능</span>
          </div>
          <div className="capability">
            <span>생기부 공통 문구 제외</span>
            <span className="badge teal">사용 가능</span>
          </div>
          <div className="capability">
            <span>교사·학생 계정과 검토 기록</span>
            <span className="badge teal">사용 가능</span>
          </div>
          <div className="capability">
            <span>인터넷 전체 출처 검색</span>
            <span className="badge gray">미연결</span>
          </div>
          <div className="capability">
            <span>AI 작성 탐지 모델</span>
            <span className="badge gray">미연결</span>
          </div>
          <div className="capability">
            <span>스캔 PDF·손글씨 OCR</span>
            <span className="badge gray">미지원</span>
          </div>
          <p className="help">
            출처 원문을 참고자료실에 직접 등록하면 해당 자료와 대조할 수 있습니다. 연결되지 않은
            기능의 점수를 만들어 표시하지 않습니다.
          </p>
        </section>
        <section className="settings-card">
          <LockKeyhole size={27} />
          <h2>학교 구성원과 문서 보관</h2>
          <p>
            관리자는 계정을 만들고, 교사는 학교 문서를 검토합니다. 학생은 본인의 제출 문서와 공유
            참고자료만 열 수 있습니다.
          </p>
          <p>
            다른 학생의 원문·이름은 학생 결과에서 숨깁니다. 자료는 이 컴퓨터에 저장되며 외부로 자동
            전송되지 않습니다.
          </p>
          <div className="notice">
            <WifiOff size={20} />
            <p>
              현재는 같은 컴퓨터에서 사용하는 로컬 버전입니다. 학교의 여러 기기에서 공동 사용하려면
              별도의 서버 배포와 HTTPS 설정이 필요합니다.
            </p>
          </div>
        </section>
        <section className="settings-card">
          <FileText size={27} />
          <h2>문서와 검사 한도</h2>
          <p>TXT, MD, CSV, DOCX, HWPX, 텍스트 PDF를 지원합니다. HWP는 HWPX로 변환해 주세요.</p>
          <ul>
            <li>파일당 10MB / 문서당 60,000자</li>
            <li>한 번에 등록 20개 / 검사 40개</li>
            <li>문서 보관 300개 / 비교 대상 합계 100만 자</li>
            <li>PDF 150쪽 / 이미지 OCR 미지원</li>
          </ul>
          <p className="help">
            문서의 서식·각주 구조에 따라 추출 내용이 달라질 수 있습니다. 검사 전 원문 미리보기를
            확인해 주세요.
          </p>
        </section>
      </div>
    </>
  );
}
function Members({ users, reload, notify }) {
  const [adding, setAdding] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/users', Object.fromEntries(new FormData(e.currentTarget)));
      await reload();
      setAdding(false);
      notify('계정을 만들었습니다.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="학교 구성원"
        description="역할에 따라 문서 접근과 검토 권한이 달라집니다."
        action={
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={17} />
            구성원 추가
          </button>
        }
      />
      <section className="table-panel">
        <div className="table-scroll">
          <table className="document-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>역할</th>
                <th>등록일</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                  </td>
                  <td>{u.username}</td>
                  <td>
                    <span className="badge blue">{roles[u.role]}</span>
                  </td>
                  <td>{when(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="notice member-help">
        <Users size={23} />
        <p>
          관리자: 계정 관리와 전체 문서 검토
          <br />
          교사: 전체 문서 검사·검토, 참고자료 등록
          <br />
          학생: 본인 문서 검사, 다른 학생의 정보는 비공개
        </p>
      </div>
      {adding && (
        <Modal
          title="학교 구성원 추가"
          description="이 컴퓨터의 작업 공간에서 사용할 계정을 만듭니다."
          onClose={() => setAdding(false)}
        >
          <form onSubmit={submit}>
            <div className="form-row">
              <label>
                이름
                <input name="name" required maxLength={150} />
              </label>
              <label>
                역할
                <select name="role">
                  <option value="teacher">교사</option>
                  <option value="student">학생</option>
                  <option value="admin">관리자</option>
                </select>
              </label>
            </div>
            <label>
              아이디
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9_.\-]{3,40}"
                placeholder="영문·숫자 3~40자"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                name="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn primary" disabled={busy}>
                {busy && <Spinner />}계정 만들기
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
