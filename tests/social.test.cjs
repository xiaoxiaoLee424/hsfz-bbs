// Run against a disposable SQLite database; never read or mutate the site's runtime data.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hsfz-social-test-'));
process.env.HSFZ_DATA_DIR = temp;
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
const { db } = require('../lib/db.ts');
const social = require('../lib/social.ts');
const users = db.prepare("SELECT id, username FROM users WHERE status = 'approved' AND banned = 0 ORDER BY id LIMIT 3").all();
const [a, b, c] = users;
assert.equal(users.length, 3);
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

test('DM pairs are unique in either direction, self/unknown recipients are rejected', () => {
  const id = social.startConversation(a.id, b.username);
  assert.equal(social.startConversation(b.id, a.username), id);
  assert.throws(() => social.startConversation(a.id, a.username), social.SocialError);
  assert.throws(() => social.startConversation(a.id, 'does-not-exist'), social.SocialError);
});
test('DM authorization covers reads, sends, and read receipts; unread counts are race safe', () => {
  const id = social.startConversation(a.id, b.username);
  const first = social.sendDirectMessage(a.id, id, 'hello **friend**');
  assert.equal(social.directMessages(b.id, id)[0].content, 'hello **friend**');
  assert.equal(social.unreadDirectCount(b.id), 1);
  assert.equal(require('../lib/dm.ts').unreadDmCount(b.id), 1);
  assert.equal(social.conversationFor(id, c.id), undefined);
  assert.throws(() => social.directMessages(c.id, id), social.SocialError);
  assert.throws(() => social.sendDirectMessage(c.id, id, 'injected'), social.SocialError);
  assert.throws(() => social.markDirectRead(c.id, id, first), social.SocialError);
  const second = social.sendDirectMessage(a.id, id, 'arrived while reading');
  social.markDirectRead(b.id, id, first);
  assert.equal(social.unreadDirectCount(b.id), 1);
  social.markDirectRead(b.id, id, second);
  social.markDirectRead(b.id, id, first);
  assert.equal(social.unreadDirectCount(b.id), 0);
});
test('messages reject empty, oversized, and unavailable accounts', () => {
  const id = social.startConversation(a.id, b.username);
  assert.throws(() => social.sendDirectMessage(a.id, id, '  '), social.SocialError);
  assert.throws(() => social.sendDirectMessage(a.id, id, 'a'.repeat(10001)), social.SocialError);
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(b.id);
  assert.throws(() => social.sendDirectMessage(a.id, id, 'no'), social.SocialError);
  assert.throws(() => social.sendDirectMessage(b.id, id, 'no'), social.SocialError);
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(b.id);
});
test('groups join atomically, gate discussion/member data, and revoke access on leave', () => {
  const id = social.createGroup(a.id, '数学讨论', '一起研究问题');
  assert.equal(social.groupById(id, a.id).member_count, 1);
  assert.equal(social.groupById(id, a.id).joined, 1);
  assert.throws(() => social.groupMessages(b.id, id), social.SocialError);
  assert.throws(() => social.groupMembers(b.id, id), social.SocialError);
  assert.throws(() => social.sendGroupMessage(b.id, id, 'no'), social.SocialError);
  social.joinGroup(b.id, id); social.joinGroup(b.id, id);
  assert.equal(social.groupById(id).member_count, 2);
  const message = social.sendGroupMessage(a.id, id, '$x^2$');
  assert.equal(social.groupById(id, b.id).unread, 1);
  social.markGroupRead(b.id, id, message);
  assert.equal(social.groupById(id, b.id).unread, 0);
  social.leaveGroup(b.id, id);
  assert.throws(() => social.groupMessages(b.id, id), social.SocialError);
  assert.throws(() => social.sendGroupMessage(b.id, id, 'no'), social.SocialError);
  assert.throws(() => social.leaveGroup(a.id, id), social.SocialError);
  assert.equal(social.groupById(id).member_count, 1);
  assert.throws(() => social.joinGroup(c.id, 999999), social.SocialError);
  assert.throws(() => social.createGroup(a.id, 'x', ''), social.SocialError);
});
test('DM and group history paginate without losing the oldest messages', () => {
  const id = social.startConversation(a.id, c.username);
  for (let i = 0; i < 55; i++) social.sendDirectMessage(a.id, id, `message ${i}`);
  const latest = social.directMessages(c.id, id);
  assert.equal(latest.length, 50);
  const older = social.directMessages(c.id, id, latest[0].id);
  assert.equal(older.length, 5);
  assert.ok(older.at(-1).id < latest[0].id);
  const group = social.createGroup(a.id, '历史消息', '');
  for (let i = 0; i < 55; i++) social.sendGroupMessage(a.id, group, `message ${i}`);
  const recent = social.groupMessages(a.id, group);
  assert.equal(recent.length, 50);
  assert.equal(social.groupMessages(a.id, group, recent[0].id).length, 5);
});
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

const { gzipSync, gunzipSync } = require('node:zlib');
const attachments = require('../lib/attachments.ts');
const transfer = require('../lib/file-transfer.ts');
function uploadForm(original, { filename = '学习资料.txt', declaredSize = original.length, payload = gzipSync(original) } = {}) {
  const form = new FormData();
  form.set('attachment', new Blob([payload]), 'attachment.gz');
  form.set('attachment_name', filename);
  form.set('attachment_size', String(declaredSize));
  return form;
}
test('browser gzip transfer round-trips binary, empty and already-compressed data losslessly', async () => {
  const { randomBytes } = require('node:crypto');
  for (const bytes of [Buffer.alloc(0), Buffer.from('你好，华附！'.repeat(100)), randomBytes(4096), gzipSync(randomBytes(8192))]) {
    const compressed = await transfer.compressFile(new File([bytes], '资料.bin'));
    const form = uploadForm(bytes, { payload: Buffer.from(await compressed.arrayBuffer()) });
    const prepared = await attachments.prepareAttachment(form);
    assert.deepEqual(gunzipSync(prepared.payload), bytes);
    const downloaded = await transfer.decompressFile(new Blob([prepared.payload]), bytes.length);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  }
});
test('10 MB original files are accepted; oversized, forged, malformed and corrupt uploads fail', async () => {
  const maximum = Buffer.alloc(transfer.MAX_FILE_BYTES, 65);
  const prepared = await attachments.prepareAttachment(uploadForm(maximum));
  assert.equal(prepared.originalSize, transfer.MAX_FILE_BYTES);
  assert.ok(prepared.payload.length < maximum.length / 10);
  await assert.rejects(transfer.compressFile(new File([Buffer.alloc(transfer.MAX_FILE_BYTES + 1)], 'too-big.bin')));
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.alloc(transfer.MAX_FILE_BYTES + 1))));
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.alloc(transfer.MAX_FILE_BYTES + 1000), { declaredSize: transfer.MAX_FILE_BYTES })));
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.from('abc'), { declaredSize: 2 })));
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.from('abc'), { payload: Buffer.from('not gzip') })));
  const corrupt = gzipSync(Buffer.from('abc')); corrupt[corrupt.length - 8] ^= 1;
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.from('abc'), { payload: corrupt })));
  await assert.rejects(attachments.prepareAttachment(uploadForm(Buffer.from('abc'), { payload: Buffer.alloc(transfer.MAX_COMPRESSED_BYTES + 1) })));
  await assert.rejects(transfer.decompressFile(new Blob([gzipSync(Buffer.from('abc'))]), 2));
});
test('DM attachments persist only compressed BLOBs, gate reads and stay transactional', async () => {
  const bytes = Buffer.from('compressed private content'.repeat(100));
  const prepared = await attachments.prepareAttachment(uploadForm(bytes, { filename: '../资料.txt' }));
  assert.equal(prepared.filename, '资料.txt');
  const id = social.startConversation(a.id, b.username);
  const messageId = social.sendDirectMessage(a.id, id, '', prepared);
  const message = social.directMessages(b.id, id).find(m => m.id === messageId);
  assert.equal(message.content, '');
  assert.equal(message.attachment.original_size, bytes.length);
  assert.ok(!('payload' in message.attachment));
  assert.ok(Math.abs(message.attachment.expires_at - Date.now() - transfer.ATTACHMENT_TTL_MS) < 1000);
  const stored = db.prepare('SELECT payload, compressed_size FROM chat_attachments WHERE id = ?').get(message.attachment_id);
  assert.deepEqual(stored.payload, prepared.payload);
  assert.equal(stored.compressed_size, stored.payload.length);
  assert.equal(attachments.readAttachment(b.id, message.attachment_id).status, 'ready');
  assert.equal(attachments.readAttachment(c.id, message.attachment_id).status, 'missing');
  db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(b.id);
  assert.equal(attachments.readAttachment(b.id, message.attachment_id).status, 'missing');
  db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(b.id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM chat_attachments').get().n;
  assert.throws(() => social.sendDirectMessage(c.id, id, '', prepared), social.SocialError);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_attachments').get().n, count);
  db.exec("CREATE TEMP TRIGGER reject_attachment_message BEFORE INSERT ON direct_messages BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  assert.throws(() => social.sendDirectMessage(a.id, id, '', prepared));
  db.exec('DROP TRIGGER reject_attachment_message');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_attachments').get().n, count);
});
test('group file downloads require current membership and expire without losing message history', async () => {
  const group = social.createGroup(a.id, '文件测试', '');
  social.joinGroup(b.id, group);
  const file = await attachments.prepareAttachment(uploadForm(Buffer.from('group-file')));
  const mid = social.sendGroupMessage(a.id, group, '给大家的资料', file);
  const message = social.groupMessages(b.id, group).find(m => m.id === mid);
  assert.equal(attachments.readAttachment(b.id, message.attachment_id).status, 'ready');
  assert.equal(attachments.readAttachment(c.id, message.attachment_id).status, 'missing');
  social.leaveGroup(b.id, group);
  assert.equal(attachments.readAttachment(b.id, message.attachment_id).status, 'missing');
  db.prepare('UPDATE chat_attachments SET expires_at = ? WHERE id = ?').run(Date.now() - 1, message.attachment_id);
  assert.equal(attachments.readAttachment(a.id, message.attachment_id).status, 'expired');
  assert.equal(db.prepare('SELECT 1 FROM chat_attachments WHERE id = ?').get(message.attachment_id), undefined);
  const history = social.groupMessages(a.id, group).find(m => m.id === mid);
  assert.equal(history.content, '给大家的资料');
  assert.equal(history.attachment_id, message.attachment_id);
  assert.equal(history.attachment, undefined);
  assert.equal(attachments.readAttachment(c.id, message.attachment_id).status, 'missing');
});
test('idle cleanup removes expired BLOBs without another upload or download', async () => {
  const file = await attachments.prepareAttachment(uploadForm(Buffer.from('short-lived')));
  const id = social.startConversation(a.id, b.username);
  const mid = social.sendDirectMessage(a.id, id, '', file);
  const attachmentId = db.prepare('SELECT attachment_id FROM direct_messages WHERE id = ?').get(mid).attachment_id;
  db.prepare('UPDATE chat_attachments SET expires_at = ? WHERE id = ?').run(Date.now() + 30, attachmentId);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(db.prepare('SELECT 1 FROM chat_attachments WHERE id = ?').get(attachmentId), undefined);
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


test('upstream DM schema migrates atomically with message IDs, history and read receipts intact', async () => {
  const { spawnSync } = require('node:child_process');
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hsfz-legacy-dm-'));
  const legacyPath = path.join(legacyDir, 'bbs.db');
  try {
    await db.backup(legacyPath);
    const legacy = new (require('better-sqlite3'))(legacyPath);
    legacy.pragma('foreign_keys = OFF');
    legacy.exec(`DROP TABLE direct_messages; DROP TABLE direct_reads; DROP TABLE direct_conversations;
      CREATE TABLE direct_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL,
        recipient_id INTEGER NOT NULL, content TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT '');`);
    const insert = legacy.prepare('INSERT INTO direct_messages VALUES (?, ?, ?, ?, ?, ?)');
    const at = '2026-10-20 10:00:00';
    insert.run(101, a.id, b.id, '旧私信一', 1, at);
    insert.run(102, b.id, a.id, '旧私信回复', 1, at);
    insert.run(103, a.id, b.id, '尚未读到的私信', 0, at);
    insert.run(104, c.id, b.id, '另一个会话', 0, at);
    legacy.close();
    const run = (body) => {
      const code = `const fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),path=require('node:path');
        const root=${JSON.stringify(root)},resolve=Module._resolveFilename;
        Module._resolveFilename=function(s,...args){return resolve.call(this,s.startsWith('@/')?path.join(root,s.slice(2)):s,...args)};
        require.extensions['.ts']=function(m,f){m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)};
        const {db}=require(path.join(root,'lib/db.ts')),social=require(path.join(root,'lib/social.ts'));
        ${body};db.close();`;
      const child = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', env: { ...process.env, HSFZ_DATA_DIR: legacyDir } });
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout.trim());
    };
    const migrated = run(`const conversation=social.startConversation(${a.id},${JSON.stringify(b.username)});
      const messages=social.directMessages(${a.id},conversation);
      const before=[social.unreadDirectCount(${a.id}),social.unreadDirectCount(${b.id}),social.unreadDirectCount(${c.id})];
      const reply=social.sendDirectMessage(${b.id},conversation,'迁移后的回复');
      console.log(JSON.stringify({ids:messages.map(m=>m.id),contents:messages.map(m=>m.content),dates:messages.map(m=>m.created_at),before,reply,
        count:db.prepare('SELECT COUNT(*) n FROM direct_conversations').get().n,
        unreadAfter:social.unreadDirectCount(${a.id}),
        backup:db.prepare("SELECT name FROM sqlite_master WHERE name='direct_messages_legacy_upgrade'").get()??null}));`);
    assert.deepEqual(migrated.ids, [101,102,103]);
    assert.deepEqual(migrated.contents, ['旧私信一','旧私信回复','尚未读到的私信']);
    assert.deepEqual(migrated.dates, [at,at,at]);
    assert.deepEqual(migrated.before, [0,2,0]);
    assert.equal(migrated.reply, 105);
    assert.equal(migrated.count, 2);
    assert.equal(migrated.unreadAfter, 1);
    assert.equal(migrated.backup, null);
    assert.deepEqual(run(`console.log(JSON.stringify({messages:db.prepare('SELECT COUNT(*) n FROM direct_messages').get().n,conversations:db.prepare('SELECT COUNT(*) n FROM direct_conversations').get().n}));`), {messages:5, conversations:2});
  } finally { fs.rmSync(legacyDir, { recursive:true, force:true }); }
});


test('upstream blocks protect text and file-only DM sends in both directions without deleting history', async () => {
  const { toggleBlock, hasBlocked, isBlocked } = require('../lib/dm.ts');
  const id = social.startConversation(a.id, b.username);
  const file = await attachments.prepareAttachment(uploadForm(Buffer.from('blocked-file')));
  const historyCount = social.directMessages(a.id, id).length;
  const fileCount = db.prepare('SELECT COUNT(*) n FROM chat_attachments').get().n;
  assert.equal(toggleBlock(a.id, b.id), 'blocked');
  assert.equal(hasBlocked(a.id, b.id), true);
  assert.equal(hasBlocked(b.id, a.id), false);
  for (const user of [a, b]) {
    assert.equal(isBlocked(user.id, user.id === a.id ? b.id : a.id), true);
    assert.throws(() => social.assertDirectSendAccess(user.id, id), /拉黑/);
    assert.throws(() => social.sendDirectMessage(user.id, id, 'blocked'), /拉黑/);
    assert.throws(() => social.sendDirectMessage(user.id, id, '', file), /拉黑/);
  }
  assert.equal(social.directMessages(b.id, id).length, historyCount);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_attachments').get().n, fileCount);
  toggleBlock(b.id, a.id);
  assert.equal(toggleBlock(a.id, b.id), 'unblocked');
  assert.equal(isBlocked(a.id, b.id), true, "one user cannot remove the other user's block");
  toggleBlock(b.id, a.id);
  assert.doesNotThrow(() => social.assertDirectSendAccess(a.id, id));
});

test('shared message validation keeps upstream sensitive-word protection for DMs and groups', () => {
  const id = social.startConversation(a.id, b.username);
  const group = social.createGroup(a.id, '合并验证', '');
  for (const content of ['代开发票', '代 开 发 票']) {
    assert.throws(() => social.sendDirectMessage(a.id, id, content), /敏感词/);
    assert.throws(() => social.sendGroupMessage(a.id, group, content), /敏感词/);
  }
  assert.equal(social.messageContent('讨论 Markdown 与 $x^2$'), '讨论 Markdown 与 $x^2$');
});

test('DM cooldown expires at fifteen seconds and remains independent for each user', () => {
  const { allowAction } = require('../lib/ratelimit.ts');
  const originalNow = Date.now;
  let at = 200000;
  Date.now = () => at;
  try {
    assert.equal(allowAction('merge-dm:a', 15000).ok, true);
    assert.deepEqual(allowAction('merge-dm:a', 15000), { ok: false, retryAfterSec: 15 });
    assert.equal(allowAction('merge-dm:b', 15000).ok, true);
    at += 14999;
    assert.deepEqual(allowAction('merge-dm:a', 15000), { ok: false, retryAfterSec: 1 });
    at += 1;
    assert.equal(allowAction('merge-dm:a', 15000).ok, true);
  } finally { Date.now = originalNow; }
});

test('upstream follow counts distinguish follower, following and viewer state', () => {
  const { followStats } = require('../lib/queries.ts');
  db.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").run(a.id, b.id);
  assert.equal(followStats(b.id, a.id).isFollowing, true);
  assert.equal(followStats(b.id).followers, 1);
  assert.equal(followStats(a.id).following, 1);
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(a.id, b.id);
});
