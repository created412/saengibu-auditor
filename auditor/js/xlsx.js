/* Offline XLSX values reader. ZIP: fflate 0.8.3 (MIT), see vendor/fflate-LICENSE.txt.
 * Only the first workbook sheet is read; formulas use saved values, never execute.
 * Formatting, merged-cell expansion and date/number display formats are not applied.
 */
(function (root) {
  const MAX_FILE = 10 * 1024 * 1024, MAX_TOTAL = 40 * 1024 * 1024;
  const fail = (message) => { throw new Error(message); };
  function decode(text) {
    return String(text || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, code) => {
      if (code[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()];
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/_x([\da-f]{4})_/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  }
  function elements(xml, name) {
    return xml.matchAll(new RegExp('<(?:[\\w.-]+:)?' + name + '\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' + name + '\\s*>)', 'g'));
  }
  function attributes(text) {
    const result = Object.create(null);
    for (const m of text.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) result[m[1]] = decode(m[3]);
    return result;
  }
  function plainText(xml) {
    // Phonetic annotations are not part of the cell's displayed text.
    const clean = xml.replace(/<(?:[\w.-]+:)?rPh\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?rPh\s*>/g, '');
    return [...elements(clean, 't')].map(m => decode(m[2])).join('');
  }
  function partPath(target) {
    if (!target || /[\\?#]|^[a-z]+:/i.test(target)) fail('엑셀 내부 시트 경로를 확인해 주세요.');
    const pieces = (target.startsWith('/') ? target.slice(1) : 'xl/' + target).split('/'), out = [];
    for (const piece of pieces) {
      if (piece === '..') { if (!out.length) fail('엑셀 내부 시트 경로를 확인해 주세요.'); out.pop(); }
      else if (piece && piece !== '.') out.push(piece);
    }
    return out.join('/');
  }
  function readXlsx(buffer, codec = root.fflate) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.byteLength > MAX_FILE) fail('파일은 10MB까지 읽을 수 있습니다. 파일을 나누어 주세요.');
    if (!codec) fail('엑셀 읽기 도구를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    let total = 0, count = 0;
    let files;
    try {
      files = codec.unzipSync(bytes, { filter: (entry) => {
        total += entry.originalSize; count++;
        if (total > MAX_TOTAL || entry.originalSize > 20 * 1024 * 1024 || count > 3000)
          fail('압축을 푼 엑셀은 합계 40MB, 항목당 20MB, 3,000개 항목까지 읽을 수 있습니다.');
        return /\.(xml|rels)$/i.test(entry.name);
      } });
    } catch (error) {
      if (/엑셀은/.test(error.message)) throw error;
      fail('엑셀 파일을 읽지 못했습니다. 암호를 해제하고 XLSX 형식으로 다시 저장해 주세요.');
    }
    function xml(path) {
      if (!files[path]) fail('엑셀의 첫 번째 시트를 찾지 못했습니다. XLSX 형식으로 다시 저장해 주세요.');
      const content = codec.strFromU8(files[path]);
      if (/<!DOCTYPE|<!ENTITY/i.test(content)) fail('외부 엔터티가 포함된 XML 문서는 읽을 수 없습니다.');
      return content.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
    }
    const workbook = xml('xl/workbook.xml');
    const first = [...elements(workbook, 'sheet')][0];
    if (!first) fail('엑셀에 읽을 시트가 없습니다.');
    const sheetAttrs = attributes(first[1]);
    const relationId = sheetAttrs['r:id'] || Object.entries(sheetAttrs).find(([key]) => key.endsWith(':id'))?.[1];
    const relations = [...elements(xml('xl/_rels/workbook.xml.rels'), 'Relationship')].map(m => attributes(m[1]));
    const rel = relations.find(r => r.Id === relationId);
    if (!rel || rel.TargetMode === 'External' || !/\/worksheet$/.test(rel.Type || ''))
      fail('첫 번째 시트는 일반 워크시트여야 합니다. XLSX 형식으로 다시 저장해 주세요.');
    const sharedRel = relations.find(r => /\/sharedStrings$/.test(r.Type || '') && r.TargetMode !== 'External');
    const sharedPath = sharedRel ? partPath(sharedRel.Target) : 'xl/sharedStrings.xml';
    const shared = files[sharedPath] ? [...elements(xml(sharedPath), 'si')].map(m => plainText(m[2] || '')) : [];
    const sheet = xml(partPath(rel.Target)), rows = [];
    let previousRow = 0, cellCount = 0, rowCount = 0;
    for (const row of elements(sheet, 'row')) {
      const rowNo = Number(attributes(row[1]).r || previousRow + 1);
      if (!Number.isInteger(rowNo) || rowNo < 1 || rowNo > 10000 || ++rowCount > 10000)
        fail('엑셀은 첫 번째 시트의 10,000행까지 읽을 수 있습니다.');
      previousRow = rowNo;
      const values = [], occupied = new Set();
      let nextCol = 0;
      for (const cell of elements(row[2] || '', 'c')) {
        if (++cellCount > 100000) fail('엑셀은 첫 번째 시트의 100,000셀까지 읽을 수 있습니다.');
        const attrs = attributes(cell[1]);
        let col = nextCol;
        if (attrs.r) {
          const ref = /^([A-Z]+)([1-9]\d*)$/i.exec(attrs.r);
          if (!ref || Number(ref[2]) !== rowNo) fail('엑셀 셀 주소가 올바르지 않습니다.');
          col = 0;
          for (const letter of ref[1].toUpperCase()) col = col * 26 + letter.charCodeAt(0) - 64;
          col--;
        }
        if (col > 255) fail('엑셀은 첫 번째 시트의 256열까지 읽을 수 있습니다.');
        if (occupied.has(col)) fail('엑셀에 중복된 셀 주소가 있습니다.');
        occupied.add(col); nextCol = col + 1;
        const body = cell[2] || '', saved = [...elements(body, 'v')][0];
        let value = decode(saved?.[2] || '');
        if (attrs.t === 'inlineStr') value = plainText(body);
        else if (attrs.t === 's') {
          if (!/^\d+$/.test(value) || Number(value) >= shared.length) fail('엑셀의 문자열 참조가 올바르지 않습니다.');
          value = shared[Number(value)];
        }
        while (values.length <= col) values.push('');
        values[col] = value;
      }
      if (rows[rowNo - 1]) fail('엑셀에 중복된 행 주소가 있습니다.');
      rows[rowNo - 1] = values;
    }
    return rows.filter(row => row && row.some(value => value.trim()));
  }
  root.SA = root.SA || {};
  root.SA.readXlsx = readXlsx;
})(typeof window === 'undefined' ? globalThis : window);
