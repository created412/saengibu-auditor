import { model } from '../../server/ai-core.js';

const abortError = () => new DOMException('검사가 취소되었습니다.', 'AbortError');
export function workerRequest(action, body, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const worker = action === 'ai' ? new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' }) : new Worker(new URL('./scan.worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const cancel = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error('검사 시간이 초과되었습니다. 글을 나누어 다시 검사해 주세요.')), action === 'ai' ? 240000 : 60000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress) { onProgress?.(data.progress); return; }
      finish(data.error ? new Error(data.error) : null, data.result);
    };
    worker.onerror = () => finish(new Error('브라우저 분석을 실행하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 시도해 주세요.'));
    worker.postMessage({ action, body, base: new URL(import.meta.env.BASE_URL, location.origin).href });
  });
}
export async function browserApi(path, options = {}) {
  if (path === '/quick/capabilities') return { authenticated: false, localDocuments: 0, publicSearch: { available: true }, browser: true };
  if (path === '/quick/ai-capabilities') return { available: true, model, processing: 'browser', minCharacters: 300 };
  if (path === '/quick/scan') return workerRequest('scan', options.body, options);
  if (path === '/quick/ai-scan') return workerRequest('ai', options.body, options);
  if (path === '/quick/extract') {
    const files = options.body.getAll('files');
    if (!files.length || files.length > 20) throw new Error('파일은 1~20개를 선택해 주세요.');
    if (files.some((file) => file.size > 10 * 1024 * 1024)) throw new Error('파일당 최대 10MB까지 지원합니다.');
    const documents = [];
    for (const file of files) {
      if (options.signal?.aborted) throw abortError();
      documents.push({ title: file.name, text: await workerRequest('extract', { name: file.name, buffer: new Uint8Array(await file.arrayBuffer()) }, options) });
    }
    return { documents };
  }
  throw new Error('이 기능은 설치형 로컬 앱에서 제공합니다.');
}
