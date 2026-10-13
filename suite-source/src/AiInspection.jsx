import React, { useEffect, useState } from 'react';
import { BrainCircuit, Download, ShieldCheck } from 'lucide-react';
import { api, download } from './api.js';
import { Spinner } from './components.jsx';
import { browserMode } from './runtime.js';

const labels = {
  'ai-suspected': 'AI 의심 신호',
  'low-signal': '낮은 신호',
  uncertain: '판단 보류',
  'not-analyzed': '미검사',
};
export default function AiInspection({ text, title, resetKey, onResult }) {
  const [enabled, setEnabled] = useState(!browserMode);
  const [progress, setProgress] = useState('');
  const [capabilities, setCapabilities] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    api('/quick/ai-capabilities')
      .then((v) => {
        if (alive) setCapabilities(v);
      })
      .catch(() => {
        if (alive) setError('AI 모델 상태를 확인하지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  useEffect(() => {
    setEnabled(!browserMode);
  }, [resetKey]);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setResult(null);
    onResult?.(null);
    setBusy(false);
    setError('');
    if (!enabled || !text.trim() || !capabilities?.available)
      return () => {
        alive = false;
      };
    const timer = setTimeout(async () => {
      setBusy(true);
      setProgress('');
      try {
        const value = await api('/quick/ai-scan', {
          method: 'POST',
          body: { text },
          signal: controller.signal,
          ...(browserMode ? { onProgress: (message) => { if (alive) setProgress(message); } } : {}),
        });
        if (alive) {
          setResult(value);
          onResult?.(value);
        }
      } catch (e) {
        if (alive && e.name !== 'AbortError') setError(e.message);
      } finally {
        if (alive) setBusy(false);
      }
    }, 1300);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, enabled, capabilities, revision, resetKey, onResult]);
  return (
    <section className="ai-inspection" aria-label="AI 작성 탐지">
      <div className="ai-heading">
        <div>
          <span className="ai-icon">
            <BrainCircuit size={23} />
          </span>
          <div>
            <h2>
              AI 작성 탐지 <small>실험 기능</small>
            </h2>
            <p>한국어 KoELECTRA · {browserMode ? '내 브라우저에서 분석' : '내 컴퓨터에서 분석'}</p>
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {browserMode ? 'AI 모델 사용' : '자동 분석'}
        </label>
      </div>
      <p className="ai-intro">
        학습된 신경망이 문장의 패턴을 분석합니다. 출처 일치율과는 별개의 신호이며, 작성자를 확정하지
        않습니다.
      </p>
      <div className="ai-status" role="status" aria-live="polite">
        {!enabled ? (
          browserMode ? 'AI 모델 사용을 켜면 자동으로 분석합니다. 처음에는 약 216MB 모델을 내려받습니다. PC의 최신 Chrome·Edge 사용을 권장합니다.' : 'AI 자동 분석을 껐습니다.'
        ) : error ? (
          error
        ) : !capabilities ? (
          '모델 상태 확인 중'
        ) : !capabilities.available ? (
          '로컬 AI 모델이 설치되지 않았습니다. 프로젝트의 setup-ai.cmd를 실행해 주세요.'
        ) : busy ? (
          <>
            <Spinner /> {progress || 'AI 모델 분석 중 · 원문은 외부로 전송하지 않습니다'}
          </>
        ) : (
          result?.reason ||
          (!text.trim()
            ? '글을 넣으면 AI 분석도 함께 시작합니다. 한국어 300자 이상을 권장합니다.'
            : result
              ? 'AI 분석 완료'
              : '입력을 마치면 AI 모델이 분석합니다.')
        )}
      </div>
      {error && (
        <button className="btn" onClick={() => setRevision((n) => n + 1)}>
          AI 분석 다시 시도
        </button>
      )}
      {result && (
        <>
          {!!result.segments.length && (
            <>
              <div className="ai-summary">
                <div>
                  <strong>
                    {result.suspectedPercent === null ? '—' : `${result.suspectedPercent}%`}
                  </strong>
                  <span>분석 어절 중 AI 의심 구간 비중</span>
                </div>
                <p>
                  AI가 작성했을 확률이 아닙니다.
                  <br />
                  분석 {result.analyzedWords.toLocaleString()}어절 · 보류·미검사{' '}
                  {result.uncertainWords.toLocaleString()}어절
                  {result.omittedCharacters > 0 &&
                    ` · 범위 밖 ${result.omittedCharacters.toLocaleString()}자`}
                </p>
              </div>
              <div className="ai-segments">
                {result.segments.map((s, i) => (
                  <details
                    key={s.id}
                    className={`ai-segment ${s.decision}`}
                    open={s.decision === 'ai-suspected'}
                  >
                    <summary>
                      <span>
                        {i + 1}구간 · {labels[s.decision]}
                      </span>
                      <small>
                        {s.score === null ? '점수 없음' : `모델 점수 ${s.score.toFixed(3)}`} ·{' '}
                        {s.text.length}자
                      </small>
                    </summary>
                    <p>{s.text}</p>
                    {s.reason && <small>{s.reason}</small>}
                  </details>
                ))}
              </div>
            </>
          )}
          <details className="ai-method">
            <summary>
              <ShieldCheck size={15} /> 모델과 해석 기준
            </summary>
            <p>
              <a href={result.model.source} target="_blank" rel="noreferrer">
                {result.model.id}
              </a>
              <br />
              버전 {result.model.revision.slice(0, 12)} · {result.model.license}
            </p>
            <p>{result.model.publisherEvaluation}</p>
            <ul>
              {result.limitations.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </details>
          <button
            className="btn ai-download"
            onClick={() =>
              download(
                `${title || '문서'}-AI분석.json`,
                JSON.stringify({ document: { title, text }, ...result }, null, 2),
              )
            }
          >
            <Download size={15} /> AI 분석 저장
          </button>
        </>
      )}
      <p className="ai-footnote">
        학교 문서에 대한 독립 검증 전 단계입니다. 점수만으로 AI 사용·부정행위를 판단하지 마세요.
      </p>
    </section>
  );
}
