// Preserve source indices so both views attach questions to the same context.
export function splitRows(lines) {
  const rows = [], left = [], right = [];
  const flush = () => {
    for (let i = 0; i < Math.max(left.length, right.length); i++) rows.push({left: left[i] || null, right: right[i] || null});
    left.length = 0; right.length = 0;
  };
  lines.forEach((line, index) => {
    const ref = {line, index};
    if (line.text[0] === "-") left.push(ref);
    else if (line.text[0] === "+") right.push(ref);
    else {
      flush();
      rows.push({left: ref, right: ref});
    }
  });
  flush();
  return rows;
}

export function displayCode(text) {
  let column = 0;
  return text.slice(1).split("\t").map((part, i) => {
    const padding = i ? " ".repeat(4 - column % 4) : "";
    column += padding.length + part.length;
    return padding + part;
  }).join("");
}

// Explicit visual lines keep paired cells the same height and preserve indent.
export function wrapCode(text, columns) {
  columns = Math.max(2, Math.floor(columns));
  const lines = [];
  let part = "", used = 0;
  for (const glyph of text) {
    const width = glyph.codePointAt(0) > 255 ? 2 : 1;
    if (used + width > columns) { lines.push(part); part = ""; used = 0; }
    part += glyph; used += width;
  }
  lines.push(part || " ");
  return lines;
}

// These files remain in the review's inventory but do not build diff rows until opened.
export function deferredReason(file) {
  const path = file.filename.toLowerCase();
  if (/(^|\/)(__snapshots__|snapshots?|generated|__generated__)(\/|$)|(?:\.snap|\.snapshot|\.generated)\.[^/]+$|\.snap$|(?:^|\/)snapshot\.json$/.test(path)) return 'Generated or snapshot file';
  if (/(^|\/)(locales?|translations?|i18n)(\/|$)|\.(po|pot|xliff|xlf)$/.test(path)) return 'Translation file';
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|composer\.lock|go\.sum)$/.test(path)) return 'Generated lockfile';
  if ((file.changes ?? ((file.additions || 0) + (file.deletions || 0))) > 800 || file.hunks?.some(h => h.lines.length > 1000)) return 'Large diff';
  return null;
}

// Pair first, then partition lexical work. This keeps replacement alignment
// unchanged at chunk boundaries; scrolling never drops or pages source lines.
export function diffEntries(hunk, context, style, chunkSize = 12) {
  const rows = [...(context?.above || []), ...hunk.lines, ...(context?.below || [])];
  const paired = style === 'split' ? splitRows(rows) : rows.map((line, index) => ({stacked: {line, index}}));
  const entries = [];
  for (let start = 0; start < paired.length; start += chunkSize) {
    const slice = paired.slice(start, start + chunkSize);
    const block = {rows, slice};
    slice.forEach((row, i) => entries.push({id: hunk.id + '-' + style + '-' + (start + i), hunk, row, block}));
  }
  return entries;
}

// Lexical preparation belongs to the visible-row path as well. Computing
// this for thousands of offscreen rows can itself exhaust a render budget.
export function lexicalBlock(block) {
  if (block.lexical) return block.lexical;
  const {rows, slice} = block;
  const indices = [...new Set(slice.flatMap(row => [row.left?.index, row.right?.index, row.stacked?.index]).filter(i => i != null))].sort((a,b) => a-b);
  const wanted = new Set(indices);
  indices.forEach((index, i) => {
    if (!i || index !== indices[i - 1] + 1) {
      for (let before = Math.max(0, index - 12); before < index; before++) wanted.add(before);
    }
  });
  const lexicalIndices = [...wanted].sort((a,b) => a-b);
  return block.lexical = {
    lexicalRows: lexicalIndices.map(index => rows[index]),
    positions: Object.fromEntries(lexicalIndices.map((index, local) => [index, local])),
  };
}
