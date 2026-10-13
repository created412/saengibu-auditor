const extname = (name) => /(?:\.[^./\\]+)$/.exec(name)?.[0] || '';
import { unzipSync, strFromU8 } from 'fflate';

export const MAX_TEXT = 60000;
export function validateText(text) {
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
  if (!clean || !/[\p{L}\p{N}]/u.test(clean))
    throw new Error('검사할 내용이 없습니다. 텍스트가 있는 문서를 선택해 주세요.');
  if (clean.length > MAX_TEXT)
    throw new Error('문서당 60,000자까지 지원합니다. 문서를 나누어 주세요.');
  return clean;
}
function safeUnzip(buffer) {
  let total = 0,
    count = 0;
  return unzipSync(buffer, {
    filter: (entry) => {
      total += entry.originalSize;
      count++;
      if (total > 40 * 1024 * 1024 || entry.originalSize > 20 * 1024 * 1024 || count > 3000)
        throw new Error('압축 문서의 내부 크기가 너무 큽니다.');
      return true;
    },
  });
}
function decodeXml(text) {
  return text
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
export async function extractFile(filename, buffer) {
  if (buffer.length > 10 * 1024 * 1024) throw new Error('파일당 최대 10MB까지 지원합니다.');
  const extension = extname(filename).toLowerCase();
  let text;
  if (['.txt', '.md', '.csv'].includes(extension)) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buffer.subarray(2));
    else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder('euc-kr', { fatal: true }).decode(buffer);
      }
    }
    if (text.includes('\u0000')) throw new Error('텍스트 파일 형식을 확인해 주세요.');
  } else if (extension === '.docx') {
    const archive = safeUnzip(buffer);
    if (!archive['word/document.xml']) throw new Error('올바른 DOCX 문서가 아닙니다.');
    const xml = strFromU8(archive['word/document.xml']);
    text = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
      .map((p) =>
        [...p[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)]
          .map((m) => (m[2] ? (m[2] === 'tab' ? '\t' : '\n') : decodeXml(m[1])))
          .join(''),
      )
      .join('\n');
  } else if (extension === '.hwpx') {
    const archive = safeUnzip(buffer);
    const sections = Object.keys(archive)
      .filter((k) => /^Contents\/section\d+\.xml$/.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!sections.length) throw new Error('올바른 HWPX 문서가 아닙니다.');
    text = sections
      .map((k) => {
        const xml = strFromU8(archive[k]);
        // Read only text nodes in document sections, never properties, scripts or external entities.
        return [...xml.matchAll(/<(?:\w+:)?p\b[^>]*>([\s\S]*?)<\/(?:\w+:)?p>/g)]
          .map((p) =>
            [...p[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
              .map((m) =>
                decodeXml(
                  m[1]
                    .replace(/<(?:\w+:)?tab\b[^>]*\/>/g, '\t')
                    .replace(/<(?:\w+:)?lineBreak\b[^>]*\/>/g, '\n')
                    .replace(/<[^>]*>/g, ''),
                ),
              )
              .join(''),
          )
          .join('\n');
      })
      .join('\n');
  } else if (extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 150) throw new Error('PDF는 150쪽까지 지원합니다. 문서를 나누어 주세요.');
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        pages.push(content.items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
      }
      text = pages.join('\n');
      if (!text.trim())
        throw new Error('스캔 PDF에는 OCR이 필요합니다. 텍스트 PDF 또는 텍스트를 입력해 주세요.');
    } finally {
      await task.destroy();
    }
  } else
    throw new Error(
      '지원 형식은 TXT, MD, CSV, DOCX, HWPX, 텍스트 PDF입니다. HWP는 HWPX로 저장해 주세요.',
    );
  return validateText(text);
}
