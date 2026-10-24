import { db } from "./db";
import type { SessionUser } from "./auth";
import { visibleContent } from "./content-policy";
import { contentReferences } from "./forum-syntax";
db.exec(`
CREATE TABLE IF NOT EXISTS custom_emojis(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, image_path TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, keywords TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS content_references(source_thread_id INTEGER NOT NULL, source_reply_id INTEGER NOT NULL DEFAULT 0,target_thread_id INTEGER NOT NULL,target_reply_id INTEGER NOT NULL DEFAULT 0,kind TEXT NOT NULL, PRIMARY KEY(source_thread_id,source_reply_id,target_thread_id,target_reply_id,kind));
CREATE INDEX IF NOT EXISTS content_refs_target ON content_references(target_thread_id,target_reply_id);
CREATE TABLE IF NOT EXISTS content_reactions(thread_id INTEGER NOT NULL,reply_id INTEGER NOT NULL DEFAULT 0,user_id INTEGER NOT NULL,reaction_key TEXT NOT NULL,PRIMARY KEY(thread_id,reply_id,user_id));
CREATE TRIGGER IF NOT EXISTS features_thread_delete AFTER DELETE ON threads BEGIN
DELETE FROM content_references WHERE source_thread_id=OLD.id OR target_thread_id=OLD.id;
DELETE FROM content_reactions WHERE thread_id=OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS features_reply_delete AFTER UPDATE OF deleted ON replies WHEN NEW.deleted=1 BEGIN
DELETE FROM content_references WHERE (source_thread_id=NEW.thread_id AND source_reply_id=NEW.id) OR (target_thread_id=NEW.thread_id AND target_reply_id=NEW.id);
DELETE FROM content_reactions WHERE thread_id=NEW.thread_id AND reply_id=NEW.id;
END;
`);
// 旧库补列（新库由上面的 CREATE TABLE 直接带上）
for (const [column, definition] of [
  ["keywords", "TEXT NOT NULL DEFAULT ''"],
  ["category", "TEXT NOT NULL DEFAULT ''"],
] as const) {
  const columns = db.prepare("PRAGMA table_info(custom_emojis)").all() as { name: string }[];
  if (columns.length && !columns.some((c) => c.name === column))
    db.exec(`ALTER TABLE custom_emojis ADD COLUMN ${column} ${definition}`);
}
export type Emoji = {
  id: number;
  name: string;
  image_path: string;
  active: number;
  /** 空格分隔的附加搜索词（如学校全称），picker 搜索用 */
  keywords: string;
  /** picker 中的自定义分区；空串归入「自定义表情」 */
  category: string;
};
export function emojis(): Emoji[] {
  return db
    .prepare("SELECT id,name,image_path,active,keywords,category FROM custom_emojis ORDER BY id")
    .all() as Emoji[];
}
export function saveReferences(
  raw: string,
  thread: number,
  reply: number,
  user: SessionUser,
) {
  db.prepare(
    "DELETE FROM content_references WHERE source_thread_id=? AND source_reply_id=?",
  ).run(thread, reply);
  for (const ref of contentReferences(raw)) {
    const target = visibleContent(user, ref.thread, ref.reply);
    if (target)
      db.prepare(
        "INSERT OR IGNORE INTO content_references VALUES(?,?,?,?,?)",
      ).run(thread, reply, ref.thread, ref.reply, ref.kind);
  }
}
export function backlinks(
  thread: number,
  reply: number,
  user: SessionUser | null,
) {
  return (
    db
      .prepare(
        "SELECT DISTINCT source_thread_id AS thread,source_reply_id AS reply FROM content_references WHERE target_thread_id=? AND target_reply_id=? LIMIT 100",
      )
      .all(thread, reply) as { thread: number; reply: number }[]
  ).filter((r) => visibleContent(user, r.thread, r.reply));
}

if (!db.prepare("SELECT 1 FROM settings WHERE key='reactions_migrated'").get())
  db.transaction(() => {
    db.exec(
      "INSERT OR IGNORE INTO content_reactions SELECT thread_id,0,user_id,'heart' FROM thread_likes",
    );
    db.prepare(
      "INSERT OR IGNORE INTO settings(key,value) VALUES('reactions_migrated','1')",
    ).run();
  }).immediate();

export type Interaction = {
  counts: { key: string; count: number }[];
  mine: string[];
  links: { thread: number; reply: number }[];
};
export function threadInteractions(thread: number, user: SessionUser) {
  const result: Record<number, Interaction> = {};
  const get = (reply: number) =>
    result[reply] ?? (result[reply] = { counts: [], mine: [], links: [] });
  for (const row of db
    .prepare(
      "SELECT reply_id,reaction_key,COUNT(*) AS n FROM emoji_reactions WHERE thread_id=? GROUP BY reply_id,reaction_key",
    )
    .all(thread) as { reply_id: number; reaction_key: string; n: number }[])
    get(row.reply_id).counts.push({ key: row.reaction_key, count: row.n });
  for (const row of db
    .prepare(
      "SELECT reply_id,reaction_key FROM emoji_reactions WHERE thread_id=? AND user_id=?",
    )
    .all(thread, user.id) as { reply_id: number; reaction_key: string }[])
    get(row.reply_id).mine.push(row.reaction_key);
  const visible = new Map<string, boolean>();
  for (const row of db
    .prepare(
      "SELECT DISTINCT target_reply_id,source_thread_id,source_reply_id FROM content_references WHERE target_thread_id=? LIMIT 500",
    )
    .all(thread) as {
    target_reply_id: number;
    source_thread_id: number;
    source_reply_id: number;
  }[]) {
    const key = `${row.source_thread_id}:${row.source_reply_id}`;
    if (!visible.has(key))
      visible.set(
        key,
        !!visibleContent(user, row.source_thread_id, row.source_reply_id),
      );
    if (visible.get(key))
      get(row.target_reply_id).links.push({
        thread: row.source_thread_id,
        reply: row.source_reply_id,
      });
  }
  return result;
}

if (
  !db
    .prepare("SELECT 1 FROM settings WHERE key='reply_references_migrated'")
    .get()
)
  db.transaction(() => {
    db.exec(
      "INSERT OR IGNORE INTO content_references SELECT r.thread_id,r.id,r.thread_id,r.reply_to,'reply' FROM replies r JOIN replies target ON target.id=r.reply_to AND target.thread_id=r.thread_id WHERE r.deleted=0 AND target.deleted=0",
    );
    db.prepare(
      "INSERT OR IGNORE INTO settings(key,value) VALUES('reply_references_migrated','1')",
    ).run();
  }).immediate();

// V2: multiple emoji per user; likes remain an independent interaction.
db.exec(`CREATE TABLE IF NOT EXISTS emoji_reactions(thread_id INTEGER NOT NULL,reply_id INTEGER NOT NULL DEFAULT 0,user_id INTEGER NOT NULL,reaction_key TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(thread_id,reply_id,user_id,reaction_key));
CREATE INDEX IF NOT EXISTS emoji_reactions_target ON emoji_reactions(thread_id,reply_id,reaction_key);
CREATE TABLE IF NOT EXISTS reply_likes(reply_id INTEGER NOT NULL,user_id INTEGER NOT NULL,PRIMARY KEY(reply_id,user_id));
CREATE TRIGGER IF NOT EXISTS emoji_thread_cleanup AFTER DELETE ON threads BEGIN DELETE FROM emoji_reactions WHERE thread_id=OLD.id; END;
CREATE TRIGGER IF NOT EXISTS emoji_reply_cleanup AFTER UPDATE OF deleted ON replies WHEN NEW.deleted=1 BEGIN DELETE FROM emoji_reactions WHERE thread_id=NEW.thread_id AND reply_id=NEW.id; DELETE FROM reply_likes WHERE reply_id=NEW.id; END;`);
db.transaction(() => {
  if (
    db.prepare("SELECT 1 FROM settings WHERE key='dynamic_reactions_v2'").get()
  )
    return;
  const mapping: Record<string, string> = {
    laugh: "😂",
    thanks: "🙏",
    thinking: "🤔",
    sad: "😢",
  };
  for (const row of db.prepare("SELECT * FROM content_reactions").all() as {
    thread_id: number;
    reply_id: number;
    user_id: number;
    reaction_key: string;
  }[]) {
    if (row.reaction_key === "heart") {
      if (row.reply_id)
        db.prepare("INSERT OR IGNORE INTO reply_likes VALUES(?,?)").run(
          row.reply_id,
          row.user_id,
        );
      else
        db.prepare(
          "INSERT OR IGNORE INTO thread_likes(user_id,thread_id) VALUES(?,?)",
        ).run(row.user_id, row.thread_id);
    } else if (mapping[row.reaction_key])
      db.prepare("INSERT OR IGNORE INTO emoji_reactions VALUES(?,?,?,?,?)").run(
        row.thread_id,
        row.reply_id,
        row.user_id,
        mapping[row.reaction_key],
        Date.now(),
      );
  }
  db.prepare(
    "INSERT INTO settings(key,value) VALUES('dynamic_reactions_v2','1')",
  ).run();
}).immediate();

db.exec(`CREATE TRIGGER IF NOT EXISTS emoji_reply_hard_cleanup AFTER DELETE ON replies BEGIN DELETE FROM emoji_reactions WHERE reply_id=OLD.id; DELETE FROM reply_likes WHERE reply_id=OLD.id; END;`);
