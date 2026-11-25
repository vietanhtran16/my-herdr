import { tokenize } from './vendor/highlight.js';
import { displayCode, wrapCode } from './diff-model.js';

const extensions = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyi: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', swift: 'swift', kt: 'kotlin', kts: 'kotlin', rb: 'ruby', php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash', json: 'json', jsonc: 'json',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', conf: 'ini',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml',
  css: 'css', scss: 'scss', sql: 'sql', md: 'markdown', mdx: 'markdown',
  graphql: 'graphql', gql: 'graphql', lua: 'lua',
};
export function languageForPath(path) {
  const name = path.split('/').at(-1).toLowerCase();
  if (/^dockerfile(?:\.|$)/.test(name)) return 'dockerfile';
  if (['makefile', 'gnumakefile'].includes(name) || name.endsWith('.mk')) return 'makefile';
  if (['gemfile', 'rakefile'].includes(name)) return 'ruby';
  if (['.bashrc', '.zshrc', '.bash_profile'].includes(name)) return 'bash';
  return extensions[name.split('.').at(-1)] || null;
}

const plain = text => [{text, scope: ''}];
// Bound retained token data; rerenders and resizing reuse the same lexical work.
const cache = new Map();
export function highlightRows(path, rows) {
  const key = JSON.stringify([path, rows.map(row => row.text)]);
  if (cache.has(key)) {
    const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
  }
  const result = {LEFT: rows.map(row => plain(displayCode(row.text))), RIGHT: rows.map(row => plain(displayCode(row.text)))};
  const language = languageForPath(path);
  if (!language || key.length > 200000) return result;
  for (const side of ['LEFT', 'RIGHT']) {
    const indices = rows.flatMap((row, index) => {
      const kind = row.text[0];
      return kind === '\\' || kind === (side === 'LEFT' ? '+' : '-') ? [] : [index];
    });
    const source = indices.map(index => displayCode(rows[index].text)).join('\n');
    try {
      const tokens = tokenize(source, language);
      // If a grammar fails, use literal source instead of an incomplete result.
      if (tokens.map(token => token.text).join('') !== source) continue;
      const lines = [[]];
      for (const token of tokens) {
        token.text.split('\n').forEach((text, i) => {
          if (i) lines.push([]);
          if (text) lines.at(-1).push({text, scope: token.scope});
        });
      }
      indices.forEach((index, i) => { result[side][index] = lines[i]?.length ? lines[i] : plain(''); });
    } catch (_) { /* Unsupported or failing grammars retain plain code. */ }
  }
  cache.set(key, result);
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  return result;
}

// Split at the same Unicode-aware boundaries as plain code, even inside tokens.
export function wrapTokens(tokens, columns) {
  const text = tokens.map(token => token.text).join('');
  if (!text) return [plain(' ')];
  let index = 0, offset = 0;
  return wrapCode(text, columns).map(line => {
    const parts = [];
    let remaining = line.length;
    while (remaining > 0 && index < tokens.length) {
      const token = tokens[index];
      const count = Math.min(remaining, token.text.length - offset);
      if (count) parts.push({text: token.text.slice(offset, offset + count), scope: token.scope});
      remaining -= count; offset += count;
      if (offset === token.text.length) { index++; offset = 0; }
    }
    return parts;
  });
}

export function syntaxColor(scope, t) {
  const root = scope.split('.')[0];
  if (['comment', 'doctag', 'quote'].includes(root)) return t.muted;
  if (['string', 'regexp', 'char', 'addition'].includes(root)) return t.ansi2;
  if (['number', 'literal', 'symbol', 'bullet'].includes(root)) return t.ansi3;
  if (['keyword', 'selector-tag', 'meta', 'deletion'].includes(root)) return t.ansi5;
  if (['title', 'section', 'attribute', 'attr', 'selector-class', 'selector-id'].includes(root)) return t.ansi4;
  if (['type', 'built_in', 'variable', 'tag', 'name'].includes(root)) return t.ansi6;
  return t.foreground;
}
