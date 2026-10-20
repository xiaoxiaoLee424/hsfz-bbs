import { db } from "./db";
export function recommendationsEnabled(userId:number): boolean {
  return !!db.prepare("SELECT 1 FROM user_experiments WHERE user_id=? AND recommendations_enabled=1").get(userId);
}
export function setRecommendationsEnabled(userId:number,enabled:boolean) {
  db.transaction(()=>{
    db.prepare(`INSERT INTO user_experiments(user_id,recommendations_enabled) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET recommendations_enabled=excluded.recommendations_enabled`).run(userId,enabled?1:0);
    db.prepare("INSERT INTO recommendation_meta VALUES('cf-refreshed','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
    if (!enabled) db.prepare("DELETE FROM user_interactions WHERE user_id=?").run(userId);
    else {
      // One-time, bounded backfill of this account's existing confirmed interactions.
      db.prepare("INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT user_id,thread_id,2 FROM thread_likes WHERE user_id=? ORDER BY rowid DESC LIMIT 200").run(userId);
      db.prepare("INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT user_id,thread_id,4 FROM thread_favorites WHERE user_id=? ORDER BY rowid DESC LIMIT 200").run(userId);
      db.prepare("INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT author_id,thread_id,3 FROM replies WHERE author_id=? ORDER BY id DESC LIMIT 200").run(userId);
    }
  })();
}
