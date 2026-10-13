import React, { useState } from 'react';
import { Archive, ArchiveRestore, Save, ShieldCheck, ScanText } from 'lucide-react';
import { api, post } from './api.js';
import { Modal, Spinner } from './components.jsx';

export function DocumentManager({ document, user, onClose, onChanged, onScan, notify }) {
  const [doc, setDoc] = useState(document),
    [title, setTitle] = useState(document.title),
    [text, setText] = useState(document.text);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const editable = user.role !== 'student' || document.ownerId === user.id;
  const dirty = title !== doc.title || text !== doc.text;
  async function save() {
    setBusy(true);
    setError('');
    try {
      const updated = await api('/documents/' + doc.id, { method: 'PATCH', body: { title, text } });
      setDoc(updated);
      setTitle(updated.title);
      setText(updated.text);
      await onChanged();
      notify('원문을 저장했습니다. 수정된 문서는 다시 검사해 주세요.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    setBusy(true);
    setError('');
    try {
      const updated = await post(
        '/documents/' + doc.id + (doc.archived ? '/restore' : '/archive'),
        {},
      );
      setDoc(updated);
      await onChanged();
      notify(
        updated.archived
          ? '보관 처리했습니다. 비교 대상에서 제외되며 언제든 복원할 수 있습니다.'
          : '문서를 복원했습니다.',
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="원문·문서 관리"
      description={`수정 ${doc.revision || 1}판 · ${doc.archived ? '보관 중' : '사용 중'} · 과거 검사 결과는 당시 원문을 유지합니다.`}
      wide
      onClose={onClose}
    >
      <div className="preview-editor">
        <label>
          문서 제목
          <input
            value={title}
            maxLength={150}
            required
            readOnly={!editable || busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          추출 원문
          <textarea
            value={text}
            maxLength={60000}
            readOnly={!editable || busy}
            onChange={(e) => setText(e.target.value)}
          />
          <small>
            {text.length.toLocaleString()}자 · 검사 전에 추출 내용이 맞는지 확인해 주세요.
          </small>
        </label>
      </div>
      {dirty && (
        <p className="suite-notice">저장하지 않은 변경이 있습니다. 저장한 뒤 검사할 수 있어요.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        {editable && (
          <>
            <button className="btn" disabled={busy || dirty} onClick={archive}>
              {doc.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}{' '}
              {doc.archived ? '복원' : '보관 처리'}
            </button>
            <button
              className="btn primary"
              disabled={busy || !dirty || !title.trim() || !text.trim()}
              onClick={save}
            >
              {busy ? <Spinner /> : <Save size={16} />}변경 저장
            </button>
          </>
        )}
        <button
          className="btn"
          disabled={!text.trim() || busy}
          onClick={() => {
            onClose();
            window.dispatchEvent(new CustomEvent('suite:audit', { detail: { text } }));
          }}
        >
          <ShieldCheck size={16} />
          감사관에서 점검
        </button>
        {!doc.reference && !doc.archived && editable && (
          <button className="btn" disabled={busy || dirty} onClick={() => onScan(doc)}>
            <ScanText size={16} />
            다시 검사
          </button>
        )}
        <button className="btn" onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  );
}
export function PasswordForm({ notify }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function change(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setError('');
    if (body.newPassword !== body.confirmPassword) {
      setError('새 비밀번호가 서로 다릅니다.');
      return;
    }
    setBusy(true);
    try {
      await post('/account/password', {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      form.reset();
      notify('비밀번호를 변경했습니다. 다른 로그인 세션은 종료되었습니다.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>내 비밀번호 변경</h2>
      <p>현재 로그인을 유지하고 다른 로그인 세션을 종료합니다.</p>
      <form onSubmit={change} style={{ marginTop: 20 }}>
        <label>
          현재 비밀번호
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          새 비밀번호
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? <Spinner /> : null}비밀번호 변경
        </button>
      </form>
    </section>
  );
}
