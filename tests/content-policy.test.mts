import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const directory = mkdtempSync(path.join(tmpdir(), "hsfz-features-"));
process.env.HSFZ_DATA_DIR = directory;
process.env.HSFZ_ENCRYPT_KEY =
  "isolated-feature-test-key-at-least-32-characters";
delete process.env.HSFZ_SEED_DEMO;
const { db } = await import("../lib/db");
const { visibleContent } = await import("../lib/content-policy");
const { saveReferences, backlinks } = await import("../lib/forum-features");
const { claimInline } = await import("../lib/inline-uploads");
const { userThreads } = await import("../lib/queries");
import type { SessionUser } from "../lib/auth";
const user = (id: number): SessionUser => ({
  id,
  username: "user" + id,
  nickname: "User",
  avatar: "",
  role: "user",
  status: "approved",
  banned: 0,
  custom_title: "",
  grade: "高一",
});
for (const id of [1, 2, 3])
  db.prepare(
    "INSERT INTO users(id,username,password_hash,nickname) VALUES(?,?,'hash','User')",
  ).run(id, "user" + id);
const board = (
  db.prepare("SELECT id FROM boards WHERE slug='study'").get() as { id: number }
).id;
const announcements = (
  db.prepare("SELECT id FROM boards WHERE slug='announcements'").get() as {
    id: number;
  }
).id;
for (const id of [1, 2, 3])
  db.prepare(
    "INSERT INTO threads(id,board_id,author_id,title,content) VALUES(?,?,1,'Test','Body')",
  ).run(id, board);
db.prepare(
  "INSERT INTO threads(id,board_id,author_id,title,content) VALUES(?,?,1,'Ann','Body')",
).run(4, announcements);
db.prepare(
  "INSERT INTO replies(id,thread_id,author_id,content) VALUES(1,1,1,'Reply')",
).run();
db.prepare(
  "INSERT INTO replies(id,thread_id,author_id,content,deleted) VALUES(2,1,1,'Deleted',1)",
).run();
db.prepare(
  "INSERT INTO replies(id,thread_id,author_id,content) VALUES(3,4,1,'AnnReply')",
).run();
after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("guests can only read announcement main posts", () => {
  assert.equal(visibleContent(null, 1), null);
  assert.ok(visibleContent(null, 4));
  assert.equal(visibleContent(null, 4, 3), null);
  assert.equal(visibleContent(null, 999), null);
});
test("members read any thread; replies must exist, be undeleted and belong to the thread", () => {
  assert.ok(visibleContent(user(2), 1));
  assert.ok(visibleContent(user(2), 4, 3));
  assert.ok(visibleContent(user(2), 1, 1));
  assert.equal(visibleContent(user(2), 1, 2), null);
  assert.equal(visibleContent(user(2), 1, 3), null);
  assert.equal(visibleContent(user(2), 999), null);
});
test("visibility hides non-public threads and floors from unauthorized viewers", () => {
  db.prepare(
    "INSERT INTO threads(id,board_id,author_id,title,content,visibility) VALUES(5,?,1,'Diary','Secret','private')",
  ).run(board);
  db.prepare(
    "INSERT INTO threads(id,board_id,author_id,title,content,visibility) VALUES(6,?,1,'For followers','Hello','followers')",
  ).run(board);
  db.prepare(
    "INSERT INTO replies(id,thread_id,author_id,content,visibility) VALUES(5,1,2,'Whisper','private')",
  ).run();
  const admin: SessionUser = { ...user(3), role: "admin" };
  // 私密帖：游客与陌生人不可见；作者与管理员可见
  assert.equal(visibleContent(null, 5), null);
  assert.equal(visibleContent(user(2), 5), null);
  assert.ok(visibleContent(user(1), 5));
  assert.ok(visibleContent(admin, 5));
  // 关注者可见：未关注不可见，关注后可见
  assert.equal(visibleContent(user(2), 6), null);
  db.prepare("INSERT INTO follows(follower_id,following_id) VALUES(2,1)").run();
  assert.ok(visibleContent(user(2), 6));
  // 楼层级可见范围：私密楼层只有作者本人与管理员能读
  assert.equal(visibleContent(user(1), 1, 5), null);
  assert.ok(visibleContent(user(2), 1, 5));
  assert.ok(visibleContent(admin, 1, 5));
});
test("userThreads exposes non-public threads only to their author", () => {
  assert.ok(userThreads(1).every((t) => t.visibility === "public"));
  assert.ok(userThreads(1, 1).some((t) => t.id === 5));
  // 列表层保守处理：非公开帖只认作者本人，即使访问者已关注也不在列表露出
  assert.ok(!userThreads(1, 2).some((t) => t.id === 5));
  assert.ok(!userThreads(1, 2).some((t) => t.id === 6));
});
test("backlinks are transactional and hidden when the source reply is deleted", () => {
  saveReferences("[quote thread=1 reply=0]\n\nBody\n\n[/quote]", 3, 0, user(1));
  assert.equal(backlinks(1, 0, user(1)).length, 1);
  assert.equal(backlinks(1, 0, user(2)).length, 1);
  db.prepare(
    "INSERT INTO replies(id,thread_id,author_id,content) VALUES(4,3,1,'Src')",
  ).run();
  saveReferences("[quote thread=1 reply=0]\n\nBody\n\n[/quote]", 3, 4, user(1));
  db.prepare("UPDATE replies SET deleted=1 WHERE id=4").run();
  const links = backlinks(1, 0, user(2));
  assert.equal(links.some((l) => l.thread === 3 && l.reply === 4), false);
  assert.equal(links.length, 1);
  saveReferences("removed", 3, 0, user(1));
  assert.equal(backlinks(1, 0, user(1)).length, 0);
});
test("claiming uploads rejects other owners, expiry and quotas", () => {
  const id = "a".repeat(32),
    raw = `![image](/inline-images/${id})`;
  db.prepare(
    "INSERT INTO inline_uploads(id,user_id,file,size,expires) VALUES(?,1,'image.png',100,?)",
  ).run(id, Date.now() + 60000);
  assert.throws(() => claimInline(raw, 2, 1, 0, 1000, 4), /不属于你/);
  assert.throws(() => claimInline(raw, 1, 1, 0, 50, 4), /10MB/);
  db.transaction(() => claimInline(raw, 1, 1, 0, 1000, 4)).immediate();
  assert.doesNotThrow(() => claimInline(raw, 1, 1, 0, 1000, 4));
  db.prepare("DELETE FROM threads WHERE id=1").run();
  assert.equal(
    (
      db.prepare("SELECT expires FROM inline_uploads WHERE id=?").get(id) as {
        expires: number;
      }
    ).expires,
    0,
  );
});


test('cleanup removes expired drafts but preserves published assets',async()=>{
 const {cleanupDraftUploads}=await import('../lib/upload-cleanup');
 const {INLINE_DIR}=await import('../lib/inline-uploads');
 mkdirSync(INLINE_DIR,{recursive:true});
 for(const [id,thread,expires] of [['b'.repeat(32),0,0],['c'.repeat(32),2,0]] as const){
  const file=id+'.bin';writeFileSync(path.join(INLINE_DIR,file),'test');
  db.prepare("INSERT INTO inline_uploads(id,user_id,file,size,thread_id,expires,kind,name) VALUES(?,1,?,4,?,?,'file','test.txt')").run(id,file,thread,expires);
 }
 cleanupDraftUploads();assert.equal(existsSync(path.join(INLINE_DIR,'b'.repeat(32)+'.bin')),false);assert.equal(existsSync(path.join(INLINE_DIR,'c'.repeat(32)+'.bin')),true);
});

test('dynamic reactions allow multiple emoji per user and do not create likes',()=>{
 db.prepare('INSERT OR IGNORE INTO emoji_reactions VALUES(2,0,2,?,1)').run('🐱');
 db.prepare('INSERT OR IGNORE INTO emoji_reactions VALUES(2,0,2,?,2)').run('🎉');
 db.prepare('INSERT OR IGNORE INTO emoji_reactions VALUES(2,0,2,?,3)').run('🐱');
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM emoji_reactions WHERE thread_id=2 AND user_id=2').get() as {n:number}).n,2);
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM thread_likes WHERE thread_id=2 AND user_id=2').get() as {n:number}).n,0);
 db.prepare('DELETE FROM emoji_reactions WHERE thread_id=2 AND user_id=2 AND reaction_key=?').run('🐱');
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM emoji_reactions WHERE thread_id=2 AND user_id=2').get() as {n:number}).n,1);
});
