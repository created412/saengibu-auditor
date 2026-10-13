import { browserMode } from './runtime.js';
export async function api(path, options = {}) {
  if (browserMode) return (await import('./browser/api.js')).browserApi(path, options);
  const form = options.body instanceof FormData;
  const response = await fetch('/api' + path, {
    ...options,
    headers: { ...(!form ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    ...(options.body && !form ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}
export const post = (path, body) => api(path, { method: 'POST', body });
export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value) {
  const str = String(value ?? '');
  return '"' + (/^[=+@\-\t\r]/.test(str) ? "'" : '') + str.replace(/"/g, '""') + '"';
}
export const when = (value) =>
  new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
export const roles = { admin: '관리자', teacher: '교사', student: '학생' };
export const kinds = {
  assignment: '수행평가',
  record: '생기부·세특',
  research: '연구·일반',
  reference: '참고자료',
};
