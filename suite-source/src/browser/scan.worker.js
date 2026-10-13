import { browserScan } from './scan.js';
import { extractFile } from '../../server/extract.js';
self.onmessage = async ({ data }) => {
  try {
    let result;
    if (data.action === 'extract') {
      if (/\.pdf$/i.test(data.body.name)) {
        const pdf = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdf.GlobalWorkerOptions.workerSrc = data.base + 'vendor/pdf.worker.min.mjs';
      }
      result = await extractFile(data.body.name, data.body.buffer);
    } else result = await browserScan(data.body);
    self.postMessage({ result });
  } catch (e) { self.postMessage({ error: e.message }); }
};
