import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  CheckCircle2,
  MessageSquare,
  Info,
  ScanText,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { api, post, download, when, kinds } from './api.js';
import { Spinner, Badge, Empty } from './components.jsx';
import AiInspection from './AiInspection.jsx';

function HighlightedText({ text, matches, selected, onSelect }) {
  const cuts = [...new Set([0, text.length, ...matches.flatMap((m) => [m.start, m.end])])].sort(
    (a, b) => a - b,
  );
  return (
    <div className="document-text">
      {cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1],
          active = matches.filter((m) => m.start <= start && m.end >= end);
        const match = active.find((m) => m.id === selected) || active[0];
        if (!match) return <React.Fragment key={start}>{text.slice(start, end)}</React.Fragment>;
        return (
          <button
            key={start}
            className={
              'text-mark ' +
              (match.kind === 'similar' ? 'similar ' : '') +
              (match.decision === 'excluded' ? 'excluded ' : '') +
              (match.id === selected ? 'selected' : '')
            }
            onClick={() => onSelect(match.id)}
            title={`${match.sourceTitle} · ${match.kind === 'exact' ? '연속 일치' : '문장 유사 후보'}`}
          >
            {text.slice(start, end)}
          </button>
        );
      })}
    </div>
  );
}

export default function Report({ id, onBack, user, notify, onUpdated, initialReport, aiReport }) {
  const [localAi, setLocalAi] = useState(null);
  const [report, setReport] = useState(initialReport || null),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState('all'),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (initialReport) {
      setReport(initialReport);
      setSelected(initialReport.matches[0]?.id);
      return;
    }
    let alive = true;
    setReport(null);
    setError('');
    api('/reports/' + id)
      .then((r) => {
        if (alive) {
          setReport(r);
          setSelected(r.matches[0]?.id);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id, initialReport]);
  const match = report?.matches.find((m) => m.id === selected);
  useEffect(() => {
    setNote(match?.note || '');
  }, [match]);
  async function review(decision) {
    setBusy(true);
    try {
      const result = await post('/reports/' + id + '/review', {
        matchId: selected,
        decision,
        note,
      });
      setReport(result);
      await onUpdated();
      notify('검토 기록을 저장했습니다.');
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <Empty
        title="결과를 불러오지 못했습니다"
        text={error}
        action={
          <button className="btn" onClick={onBack}>
            목록으로
          </button>
        }
      />
    );
  if (!report)
    return (
      <div className="loading">
        <Spinner />
        검사 결과를 불러오는 중
      </div>
    );
  const matches = report.matches.filter(
    (m) =>
      filter === 'all' || (filter === 'reviewed' ? m.decision !== 'pending' : m.kind === filter),
  );
  const reviewed = report.matches.filter((m) => m.decision !== 'pending').length;
  const insufficient = report.sourceCount === 0 || report.score === null;
  return (
    <div className="report-page">
      <div className="report-toolbar">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={17} /> 검사 목록
        </button>
        <div>
          <button
            className="btn"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('suite:audit', { detail: { text: report.document.text } }),
              )
            }
          >
            <ShieldCheck size={16} /> 감사관에서 점검
          </button>
          <button
            className="btn"
            onClick={() =>
              download(
                `${report.document.title}-검사결과.json`,
                JSON.stringify({ ...report, aiDetection: aiReport || localAi || null }, null, 2),
              )
            }
          >
            <Download size={16} /> 결과 저장
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={16} /> 인쇄·PDF
          </button>
        </div>
      </div>
      <div className="report-heading">
        <div>
          <span className="muted">{kinds[report.document.kind]} 검사 결과</span>
          <h1>{report.document.title}</h1>
          <p>
            {report.document.author && (
              <>
                {report.document.author} <span className="dot-sep">/</span>{' '}
              </>
            )}
            {when(report.createdAt)} 검사 <span className="dot-sep">/</span>{' '}
            {report.document.text.length.toLocaleString()}자
            {report.document.sample && <span className="sample-tag">가상 예제</span>}
          </p>
        </div>
        <span className="badge blue">
          <ShieldCheck size={13} />
          근거 기반 분석
        </span>
      </div>
      <div className="report-summary">
        <div className="score-ring" style={{ '--score': `${insufficient ? 0 : report.score}%` }}>
          <div>
            <strong>
              {insufficient ? '—' : report.score}
              {!insufficient && <small>%</small>}
            </strong>
            <span>어절 일치율</span>
          </div>
        </div>
        <div className="report-summary-copy">
          <h3>
            {report.sourceCount === 0
              ? '검사 근거 부족'
              : report.totalWords === 0
                ? '모든 내용이 제외되었습니다'
                : report.matches.length
                  ? '문장과 출처를 함께 살펴보세요'
                  : '설정한 조건에서 일치 구간이 없습니다'}
          </h3>
          {insufficient ? (
            <p>확보한 비교자료가 없어 일치율을 계산하지 않았습니다.</p>
          ) : (
            <p>
              유효 {report.totalWords.toLocaleString()}어절 중{' '}
              {report.matchedWords.toLocaleString()}
              어절 일치 · {report.excludedWords}어절 제외
            </p>
          )}
          <small>일치율은 표절 여부의 판정이 아닙니다. 문장의 맥락과 인용을 확인해 주세요.</small>
        </div>
        <div className="report-stat">
          <b>{report.sourceCount}</b>
          <span>비교 문서</span>
        </div>
        <div className="report-stat">
          <b>{report.matches.length}</b>
          <span>발견 구간</span>
        </div>
        <div className="report-stat">
          <b>
            {reviewed}
            <small>/{report.matches.length}</small>
          </b>
          <span>검토 완료</span>
        </div>
      </div>
      {report.matches.some((m) => m.kind === 'similar') && (
        <div className="suite-notice candidate-notice">
          <Info size={17} />
          <span>
            <b>변형 문장 후보 {report.matches.filter((m) => m.kind === 'similar').length}개</b> ·
            띄어쓰기·일부 표현이 다른 구간입니다. 어절 일치율이 0%여도 이 근거는 확인해 주세요. 변형
            후보는 일치율에 합산하지 않습니다.
          </span>
        </div>
      )}
      <div className="coverage-strip">
        <Info size={15} />
        <span>{report.coverage}</span>
        <details>
          <summary>
            검사 설정 <ChevronDown size={13} />
          </summary>
          <div>
            최소 {report.settings.minWords}어절 연속 일치
            <br />
            인용문 {report.settings.excludeQuotes ? '제외' : '포함'} / 참고문헌{' '}
            {report.settings.excludeReferences ? '제외' : '포함'}
            <br />
            공통 문구 {report.settings.ignorePhrases.length}개 제외
            <br />
            유사 후보는 정규화한 문자 구간과 문자 묶음·순서를 비교하며 일치율에 포함하지 않습니다.
          </div>
        </details>
      </div>
      {report.evidence && <EvidenceScope evidence={report.evidence} />}
      {!initialReport && (
        <AiInspection
          key={report.id || id}
          text={report.document.text}
          title={report.document.title}
          onResult={setLocalAi}
        />
      )}
      <div className="report-workspace">
        <section className="original-pane">
          <div className="pane-header">
            <h3>
              <FileText size={17} />
              검사 문서
            </h3>
            <div className="legend">
              <span className="exact-dot" />
              연속 일치
              <span className="similar-dot" />
              유사 후보
              <span className="excluded-dot" />
              검토 제외
            </div>
          </div>
          <div className="document-paper">
            <div className="document-eyebrow">{kinds[report.document.kind]}</div>
            <h2>{report.document.title}</h2>
            <p className="document-author">{report.document.author}</p>
            <HighlightedText
              text={report.document.text}
              matches={report.matches}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
        </section>
        <aside className="evidence-pane">
          <div className="pane-header">
            <h3>
              <Link2 size={17} />
              비교 근거 <span className="count">{report.matches.length}</span>
            </h3>
          </div>
          <div className="evidence-tabs">
            {[
              ['all', '전체'],
              ['exact', '연속 일치'],
              ['similar', '유사 후보'],
              ['reviewed', '검토 완료'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="evidence-list">
            {matches.length ? (
              matches.map((m, i) => (
                <button
                  key={m.id}
                  className={'evidence-item ' + (m.id === selected ? 'active' : '')}
                  onClick={() => setSelected(m.id)}
                >
                  <span className="evidence-number">{i + 1}</span>
                  <div>
                    <strong>{m.sourceTitle}</strong>
                    <p>
                      {m.kind === 'exact' ? '연속 어절 일치' : `문자 유사도 ${m.similarity}%`}{' '}
                      {m.decision === 'excluded'
                        ? '· 검토 제외'
                        : m.decision === 'followup'
                          ? '· 추가 확인'
                          : '· 검토 전'}
                    </p>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <p className="no-matches">
                {insufficient
                  ? '비교할 자료를 확보한 뒤 일치 구간을 확인할 수 있습니다.'
                  : '이 조건에 해당하는 구간이 없습니다.'}
              </p>
            )}
          </div>
          {match && (
            <div className="evidence-detail">
              <div className="detail-title">
                <span>{match.reference ? '참고자료' : '제출 문서'}</span>
                <b>{match.sourceTitle}</b>
                {match.sourceAuthor && <small>{match.sourceAuthor}</small>}
              </div>
              {match.sourceText ? (
                <blockquote>{match.sourceText}</blockquote>
              ) : (
                <div className="notice">
                  <ShieldCheck size={18} />
                  <p>
                    다른 학생의 원문은 교사만 볼 수 있습니다. 강조된 내 문장에 대해 선생님과 확인해
                    보세요.
                  </p>
                </div>
              )}
              {match.sourceUrl && (
                <a className="source-link" href={match.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  등록된 출처 열기
                </a>
              )}
              {user.role !== 'student' && (
                <div className="review-box">
                  <h4>
                    <MessageSquare size={15} />
                    선생님의 검토
                  </h4>
                  <textarea
                    aria-label="검토 메모"
                    placeholder="인용 확인, 학생에게 물어볼 질문 등을 남기세요."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    rows={3}
                  />
                  <div className="review-actions">
                    <button
                      className="btn teal-btn"
                      disabled={busy}
                      onClick={() => review('excluded')}
                    >
                      <CheckCircle2 size={15} />
                      인용 확인·제외
                    </button>
                    <button className="btn" disabled={busy} onClick={() => review('followup')}>
                      추가 확인
                    </button>
                  </div>
                  <button className="text-btn" disabled={busy} onClick={() => review('pending')}>
                    검토 전으로 저장
                  </button>
                  {match.reviewedBy && (
                    <small className="review-author">
                      {match.reviewedBy} · {when(match.reviewedAt)} 저장
                    </small>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <section className="print-evidence">
        <h2>전체 비교 근거와 검토 기록</h2>
        {report.matches.map((m, i) => (
          <article key={m.id}>
            <h3>
              {i + 1}. {m.sourceTitle}
            </h3>
            <p>검사 문장: {m.text}</p>
            <p>비교 원문: {m.sourceText || '학생 개인정보 보호로 비공개'}</p>
            <p>
              검토: {m.decision} {m.note}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function EvidenceScope({ evidence }) {
  const webLabels = {
    disabled: '사용 안 함',
    ok: '완료',
    'no-results': '검색 결과 없음',
    unavailable: '연결 실패',
    partial: '일부만 확보',
    'no-query': '검색어 추출 불가',
  };
  return (
    <section className="evidence-scope" aria-label="자동검사의 근거">
      <div>
        <h3>
          <ShieldCheck size={18} /> 자동검사의 근거
        </h3>
        <span>
          보관함 {evidence.localDocuments} · 직접 추가 {evidence.manualDocuments} · 공개자료{' '}
          {evidence.webDocuments}
        </span>
      </div>
      <p>
        일치율 = 연속 일치한 어절 수 ÷ 제외 조건을 뺀 전체 어절 수. 겹친 구간은 한 번만 세며, 변형
        문장 후보는 별도로 표시합니다.
      </p>
      <p>
        위키백과 검색: <b>{webLabels[evidence.webStatus] || evidence.webStatus}</b>. 검색으로 확보한
        자료가 곧 표절 근거는 아닙니다. 아래의 실제 일치 구간을 확인하세요.
      </p>
      {!!evidence.limitations?.length && (
        <ul className="evidence-limitations">
          {evidence.limitations.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
      <details>
        <summary>실제로 비교한 자료 {evidence.sources.length}개</summary>
        {evidence.sources.length ? (
          <ul className="evidence-source-list">
            {evidence.sources.map((source) => (
              <li key={source.id}>
                <span>
                  {{ local: '보관함', manual: '직접 추가', web: '공개자료' }[source.type]}
                </span>
                {/^https?:\/\//i.test(source.url || '') ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title} ↗
                  </a>
                ) : (
                  <b>{source.title}</b>
                )}
                <small>{source.characters.toLocaleString()}자</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>대조한 자료가 없습니다. 보관함에 자료를 등록하거나 비교자료를 추가해 주세요.</p>
        )}
      </details>
    </section>
  );
}
