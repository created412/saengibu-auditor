import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  FileText,
  UploadCloud,
  Plus,
  LoaderCircle,
  Check,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Fingerprint,
} from 'lucide-react';
import { api, post, kinds } from './api.js';

export function Brand({ light = false }) {
  return (
    <div className={'brand ' + (light ? 'light' : '')}>
      <span className="brand-mark">
        <BookOpen size={23} />
      </span>
      <strong>
        표절감사관<span>근거로 읽는 글</span>
      </strong>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle size={17} className="spin" />;
}
export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <FileText size={30} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({ score, noSources = false }) {
  if (noSources) return <span className="badge gray">비교자료 없음</span>;
  return (
    <span className={'badge ' + (score >= 30 ? 'amber' : score > 0 ? 'blue' : 'teal')}>
      {score}% 일치
    </span>
  );
}
export function Modal({ title, description, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Auth({ session, onLogin }) {
  const setup = session.needsSetup;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await post(setup ? '/setup' : '/login', { ...form, sample: form.sample === 'on' });
      await onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand light />
        <div className="auth-copy">
          <span className="auth-kicker">글의 닮음 너머, 생각의 고유함까지</span>
          <h1>
            좋은 글을 알아보는
            <br />더 깊은 시선.
          </h1>
          <p>
            학생의 탐구부터 선생님의 기록까지.
            <br />
            표절감사관은 문장과 근거를 함께 읽습니다.
          </p>
          <div className="paper-scene">
            <div className="paper-tag">
              <ShieldCheck size={16} /> 근거를 확인하는 글쓰기
            </div>
            <div className="paper">
              <span>세계사 탐구 보고서</span>
              <h3>같은 주제, 서로 다른 생각</h3>
              <i />
              <i />
              <mark>원문과 비교 자료를 나란히 읽고</mark>
              <i />
              <mark className="mint">학생의 고유한 탐구를 발견합니다.</mark>
              <i className="short" />
            </div>
            <div className="paper-stamp">
              <Fingerprint size={23} />
              <div>
                판단은 신중하게
                <br />
                <b>근거는 투명하게</b>
              </div>
            </div>
          </div>
        </div>
        <small>수행평가 검사 · 생기부 점검 · 학교 공동 작업</small>
      </section>
      <section className="auth-form">
        <div>
          <span className="local-tag">
            <span /> 내 컴퓨터에서 안전하게
          </span>
          <h2>{setup ? '우리 학교의 표절감사관을 시작하세요' : '다시 만나 반갑습니다'}</h2>
          <p>
            {setup
              ? '관리자 계정을 만들면 바로 문서를 검사할 수 있어요.'
              : `${session.school}의 작업 공간에 로그인하세요.`}
          </p>
          <form onSubmit={submit}>
            {setup && (
              <div className="form-row">
                <label>
                  학교·작업 공간
                  <input name="school" defaultValue="우리 학교" required maxLength={150} />
                </label>
                <label>
                  이름
                  <input name="name" placeholder="선생님 이름" required maxLength={150} />
                </label>
              </div>
            )}
            <label>
              아이디
              <input
                name="username"
                placeholder="영문·숫자 3자 이상"
                autoComplete="username"
                pattern="[a-zA-Z0-9_.\-]{3,40}"
                required
              />
            </label>
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                placeholder="10자 이상 입력"
                minLength={setup ? 10 : undefined}
                maxLength={128}
                autoComplete={setup ? 'new-password' : 'current-password'}
                required
              />
            </label>
            {setup && (
              <label className="check-row">
                <input type="checkbox" name="sample" defaultChecked />
                <span>
                  가상 예제 문서로 기능 둘러보기
                  <small>실제 학생 정보가 없는 수행평가·생기부 예제입니다.</small>
                </span>
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? <Spinner /> : null}
              {setup ? '작업 공간 만들기' : '로그인'}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="auth-foot">
            <ShieldCheck size={18} />
            <span>
              문서는 이 컴퓨터에 저장됩니다.
              <br />
              인터넷 전체 검색과 AI 탐지는 연결되어 있지 않습니다.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
export function UploadModal({ groups, defaultGroup, reference, onClose, onDone, isStudent }) {
  const [tab, setTab] = useState('file'),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [text, setText] = useState('');
  function acceptFiles(list) {
    setFiles(Array.from(list).slice(0, 20));
    setError(
      list.length > 20 ? '한 번에 20개까지 선택할 수 있어요. 앞의 20개를 선택했습니다.' : '',
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    form.set('reference', String(reference));
    try {
      if (tab === 'file') {
        if (!files.length) throw new Error('등록할 파일을 선택해 주세요.');
        files.forEach((file) => form.append('files', file));
        await api('/upload', { method: 'POST', body: form });
      } else await post('/documents', { ...Object.fromEntries(form), text, reference });
      await onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={reference ? '참고자료 등록' : '문서 등록'}
      description="파일을 올리거나 텍스트를 직접 입력하세요."
      onClose={busy ? () => {} : onClose}
      wide
    >
      <form onSubmit={submit}>
        <div className="form-row">
          <label>
            검사함
            <select name="groupId" defaultValue={defaultGroup || groups[0]?.id} required>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {!isStudent && (
            <label>
              작성자
              <input name="author" placeholder="이름 또는 학번" maxLength={150} />
            </label>
          )}
        </div>
        <div className="segmented">
          <button
            type="button"
            className={tab === 'file' ? 'active' : ''}
            onClick={() => setTab('file')}
          >
            파일 첨부
          </button>
          <button
            type="button"
            className={tab === 'text' ? 'active' : ''}
            onClick={() => setTab('text')}
          >
            직접 입력
          </button>
        </div>
        {tab === 'file' ? (
          <>
            <label
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                acceptFiles(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={34} />
              <b>파일을 끌어 놓거나 클릭하여 선택</b>
              <span>TXT · MD · CSV · DOCX · HWPX · 텍스트 PDF</span>
              <small>파일당 10MB · 문서당 60,000자 · 한 번에 20개</small>
              <input
                aria-label="문서 파일 선택"
                type="file"
                multiple
                accept=".txt,.md,.csv,.docx,.hwpx,.pdf"
                onChange={(e) => acceptFiles(e.target.files)}
              />
            </label>
            {files.length > 0 && (
              <div className="file-list">
                {files.map((file, i) => (
                  <div key={i}>
                    <FileText size={17} />
                    <span>{file.name}</span>
                    <small>{Math.round(file.size / 1024)} KB</small>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${file.name} 제외`}
                      onClick={() => setFiles(files.filter((_, j) => i !== j))}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="help">
              HWP는 HWPX로 저장해 주세요. 스캔 PDF·손글씨 이미지는 OCR을 지원하지 않습니다.
            </p>
          </>
        ) : (
          <>
            <label>
              문서 제목
              <input
                name="title"
                placeholder={reference ? '자료명 또는 출처 제목' : '예: 산업 혁명 탐구 보고서'}
                required
                maxLength={150}
              />
            </label>
            <label>
              문서 내용
              <textarea
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={9}
                maxLength={60000}
                placeholder="검사할 원문을 붙여 넣으세요."
                required
              />
              <small className="align-right">{text.length.toLocaleString()} / 60,000자</small>
            </label>
          </>
        )}
        {reference && (
          <label>
            출처 URL (선택)
            <input name="url" type="url" placeholder="https://" />
            <small>주소를 자동 수집하지 않습니다. 등록한 원문과 비교합니다.</small>
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? <Spinner /> : <Plus size={17} />}등록하기
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ScanModal({ documents, onClose, onDone, run }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const record = documents.some((d) => d.kind === 'record');
  async function submit(e) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      const result = await run({
        documentIds: documents.map((d) => d.id),
        settings: {
          scope: form.scope,
          minWords: Number(form.minWords),
          excludeQuotes: form.excludeQuotes === 'on',
          excludeReferences: form.excludeReferences === 'on',
          ignorePhrases: form.ignorePhrases
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean),
        },
      });
      await onDone(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="검사 조건 설정"
      description={`${documents.length}개 문서의 비교 범위와 제외 조건을 확인하세요.`}
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <div className="notice blue">
          <ShieldCheck size={21} />
          <div>
            <b>확인할 수 있는 근거만 제시합니다</b>
            <p>
              등록한 문서에서 일치·유사 구간을 찾습니다. 인터넷 전체 검색과 AI 작성 판정은 포함하지
              않습니다.
            </p>
          </div>
        </div>
        <label>
          비교 범위
          <select name="scope" defaultValue="group">
            <option value="group">같은 검사함 + 참고자료</option>
            <option value="school">학교에 등록된 전체 문서</option>
            <option value="library">참고자료만 비교</option>
          </select>
        </label>
        <label>
          최소 연속 일치 어절
          <select name="minWords" defaultValue="6">
            {[2, 3, 4, 5, 6, 8, 10, 15, 20].map((n) => (
              <option value={n} key={n}>
                {n}어절{n === 6 ? ' (기본)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="check-grid">
          <label className="check-row">
            <input type="checkbox" name="excludeQuotes" defaultChecked />
            <span>따옴표 인용문 제외</span>
          </label>
          <label className="check-row">
            <input type="checkbox" name="excludeReferences" defaultChecked />
            <span>참고문헌 이후 제외</span>
          </label>
        </div>
        <label>
          {record ? '생기부 공통 문구 제외' : '공통 문구 제외'}
          <textarea
            rows={3}
            name="ignorePhrases"
            placeholder="제외할 문구를 한 줄에 하나씩 입력하세요."
          />
          <small>입력한 표현과 정확히 일치하는 부분을 계산에서 제외합니다.</small>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? <Spinner /> : <Check size={17} />}{' '}
            {busy ? '문장과 근거를 비교하고 있어요' : '검사 시작'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function GroupModal({ onClose, onDone, initialKind = 'assignment' }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/groups', Object.fromEntries(new FormData(e.currentTarget)));
      await onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="새 검사함"
      description="수업, 학급, 기록 유형별로 문서를 모으세요."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          검사함 이름
          <input
            name="name"
            placeholder="예: 2학년 세계사 · 사료 비판 탐구"
            required
            maxLength={150}
          />
        </label>
        <label>
          문서 유형
          <select name="kind" defaultValue={initialKind}>
            {Object.entries(kinds)
              .filter(([k]) => k !== 'reference')
              .map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy && <Spinner />}검사함 만들기
          </button>
        </div>
      </form>
    </Modal>
  );
}
