const b = { username: 'student_test' };
// Run against a disposable SQLite database; never read or mutate the site's runtime data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(specifier, ...args) {
  if (specifier.startsWith('@/')) specifier = path.join(root, specifier.slice(2));
  return originalResolve.call(this, specifier, ...args);
};
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = function(module, file) {
  const source = fs.readFileSync(file, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, file);
};
test('server-rendered Markdown keeps GFM, math and safe link cards; mentions never change code', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { RichText } = require('../components/RichText.tsx');
  const render = content => renderToStaticMarkup(React.createElement(RichText, { content, usernames: [b.username] }));
  const html = render(`# Topic\n\n**bold** and $x^2$\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[Example](https://example.com/read)\n\nhttps://example.org\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))`);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
  assert.match(html, /<table>/);
  assert.match(html, /class="link-card"/);
  assert.match(html, /noopener noreferrer nofollow ugc/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /<h1>/);
  const mention = render(`Hello @${b.username}\n\n\`@${b.username}\`\n\n\`\`\`\n@${b.username}\n\`\`\``);
  assert.equal((mention.match(new RegExp(`href="/u/${b.username}"`, 'g')) || []).length, 1);
  assert.match(mention, new RegExp(`<code>@${b.username}</code>`));
});

test('editor wraps and unwraps selected text without losing the selection or neighboring content', () => {
  const { formatEditorSelection: edit } = require('../lib/editor.ts');
  const original = { value: '你好，世界！', start: 3, end: 5 };
  const bold = edit(original, 'bold');
  assert.deepEqual(bold, { value: '你好，**世界**！', start: 5, end: 7 });
  assert.deepEqual(edit(bold, 'bold'), original);
  assert.deepEqual(edit({ value: '世界', start: 0, end: 2 }, 'italic'), { value: '_世界_', start: 1, end: 3 });
  const empty = edit({ value: '', start: 0, end: 0 }, 'math');
  assert.equal(empty.value.slice(empty.start, empty.end), 'x^2 + y^2 = r^2');
  assert.equal(empty.value, '$x^2 + y^2 = r^2$');
});

test('editor formats whole selected lines, toggles lists, and leaves unselected trailing lines alone', () => {
  const { formatEditorSelection: edit } = require('../lib/editor.ts');
  const selection = { value: '第一行\n第二行\n第三行', start: 0, end: 8 };
  const listed = edit(selection, 'ordered');
  assert.equal(listed.value, '1. 第一行\n2. 第二行\n第三行');
  assert.equal(edit(listed, 'ordered').value, selection.value);
  assert.deepEqual(edit({ value: '\n后文', start: 0, end: 0 }, 'quote'), { value: '> \n后文', start: 2, end: 2 });
  assert.deepEqual(edit({ value: '', start: 0, end: 0 }, 'list'), { value: '- ', start: 2, end: 2 });
  assert.equal(edit({ value: '前文\n这里\n后文', start: 4, end: 4 }, 'heading').value, '前文\n## 这里\n后文');
});

test('editor inserts replaceable link URLs and block math/code without swallowing prose', () => {
  const { formatEditorSelection: edit, insertEditorText: insert } = require('../lib/editor.ts');
  const link = edit({ value: '参考资料', start: 2, end: 4 }, 'link');
  assert.equal(link.value, '参考[资料](https://)');
  assert.equal(link.value.slice(link.start, link.end), 'https://');
  assert.equal(insert(link, 'https://example.com').value, '参考[资料](https://example.com)');
  const math = edit({ value: '之前x^2之后', start: 2, end: 5 }, 'display-math');
  assert.equal(math.value, '之前\n\n$$\nx^2\n$$\n\n之后');
  assert.equal(math.value.slice(math.start, math.end), 'x^2');
  assert.equal(edit({ value: 'const x = 1;\n```', start: 0, end: 16 }, 'code').value, '````\nconst x = 1;\n```\n````\n');
});


