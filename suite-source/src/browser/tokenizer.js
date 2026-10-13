// BERT WordPiece, matching this pinned tokenizer's do_lower_case=false configuration.
export function createTokenizer(vocabText) {
  const vocab = new Map(vocabText.split(/\r?\n/).map((word, i) => [word, i]));
  const chinese = (n) => (n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf) ||
    (n >= 0x20000 && n <= 0x2a6df) || (n >= 0x2a700 && n <= 0x2b73f) ||
    (n >= 0x2b740 && n <= 0x2b81f) || (n >= 0x2b820 && n <= 0x2ceaf) ||
    (n >= 0xf900 && n <= 0xfaff) || (n >= 0x2f800 && n <= 0x2fa1f);
  return (text) => {
    const ids = [vocab.get('[CLS]')];
    for (const section of text.split(/(\[(?:UNK|SEP|PAD|CLS|MASK)\])/g)) {
      if (/^\[(?:UNK|SEP|PAD|CLS|MASK)\]$/.test(section)) { ids.push(vocab.get(section)); continue; }
      let clean = '';
      for (const c of section) {
        const n = c.codePointAt(0);
        if (c === '\t' || c === '\n' || c === '\r' || /\p{Zs}/u.test(c)) clean += ' ';
        else if (n === 0 || n === 0xfffd || /\p{C}/u.test(c)) continue;
        else if (chinese(n) || /\p{P}/u.test(c) || (n >= 33 && n <= 47) || (n >= 58 && n <= 64) || (n >= 91 && n <= 96) || (n >= 123 && n <= 126)) clean += ` ${c} `;
        else clean += c;
      }
      for (const word of clean.trim().split(/\s+/).filter(Boolean)) {
        const chars = Array.from(word), pieces = [];
        let start = 0, failed = chars.length > 100;
        while (!failed && start < chars.length) {
          let end = chars.length, found;
          while (end > start) {
            const token = (start ? '##' : '') + chars.slice(start, end).join('');
            if (vocab.has(token)) { found = vocab.get(token); break; }
            end--;
          }
          if (found === undefined) failed = true;
          else { pieces.push(found); start = end; }
        }
        ids.push(...(failed ? [vocab.get('[UNK]')] : pieces));
      }
    }
    ids.push(vocab.get('[SEP]'));
    return ids;
  };
}
