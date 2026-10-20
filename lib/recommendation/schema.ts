import type Database from "better-sqlite3";
import { MODEL_VERSION, DIMENSIONS } from "./config.ts";
import * as sqliteVec from "sqlite-vec";

const loaded = new WeakSet<Database.Database>();
export function loadRecommendationExtension(db: Database.Database) {
  if (!loaded.has(db)) { sqliteVec.load(db); loaded.add(db); }
}

/** No inference here: load the native SQLite extension and install idempotent SQL. */
export function initializeRecommendations(db: Database.Database) {
  loadRecommendationExtension(db);
  db.transaction(()=>{
  const old = db.prepare("SELECT sql FROM sqlite_master WHERE name='post_vectors'").get() as {sql:string}|undefined;
  if(old && !old.sql.includes(`= ${DIMENSIONS * 4}`)) {
    db.transaction(()=>{
      db.exec(`DROP TRIGGER IF EXISTS recommendation_thread_deleted; DROP TRIGGER IF EXISTS recommendation_thread_edited;
        DROP TABLE IF EXISTS vec_posts; DROP TABLE post_vectors;
        DELETE FROM item_similarity WHERE source='vec'; DELETE FROM recommendation_dirty; DELETE FROM vector_quarantine;`);
    }).immediate();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_experiments (
      user_id INTEGER PRIMARY KEY, recommendations_enabled INTEGER NOT NULL DEFAULT 0 CHECK(recommendations_enabled IN (0,1))
    );
    CREATE TABLE IF NOT EXISTS post_vectors (
      post_id INTEGER PRIMARY KEY, embedding BLOB NOT NULL CHECK(length(embedding) = ${DIMENSIONS * 4}),
      model_version TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_posts USING vec0(
      post_id INTEGER PRIMARY KEY, embedding FLOAT[${DIMENSIONS}] distance_metric=cosine
    );
    CREATE TABLE IF NOT EXISTS vector_quarantine (
      post_id INTEGER PRIMARY KEY, model_version TEXT NOT NULL, embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS recommendation_dirty (post_id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS user_interactions (
      user_id INTEGER NOT NULL, post_id INTEGER NOT NULL, action INTEGER NOT NULL CHECK(action BETWEEN 1 AND 4),
      ts INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(user_id, post_id, action)
    );
    CREATE INDEX IF NOT EXISTS interactions_post ON user_interactions(post_id, user_id);
    CREATE INDEX IF NOT EXISTS interactions_time ON user_interactions(ts);
    CREATE TABLE IF NOT EXISTS item_similarity (
      post_id INTEGER NOT NULL, similar_id INTEGER NOT NULL, score REAL NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('vec','cf')), PRIMARY KEY(post_id, source, similar_id)
    );
    CREATE INDEX IF NOT EXISTS similarity_lookup ON item_similarity(post_id, source, score DESC);
    CREATE INDEX IF NOT EXISTS similarity_target ON item_similarity(similar_id);
    CREATE INDEX IF NOT EXISTS recommendation_time ON threads(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS recommendation_board_time ON threads(board_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS recommendation_likes ON thread_likes(thread_id);
    CREATE TABLE IF NOT EXISTS recommendation_jobs (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, finished_at INTEGER NOT NULL DEFAULT (unixepoch()),
      duration_ms INTEGER NOT NULL, processed INTEGER NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS recommendation_thread_deleted AFTER DELETE ON threads BEGIN
      DELETE FROM vec_posts WHERE post_id = old.id;
      DELETE FROM post_vectors WHERE post_id = old.id;
      DELETE FROM vector_quarantine WHERE post_id = old.id;
      DELETE FROM recommendation_dirty WHERE post_id = old.id;
      DELETE FROM item_similarity WHERE post_id = old.id OR similar_id = old.id;
      DELETE FROM user_interactions WHERE post_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_thread_edited AFTER UPDATE OF title, content ON threads BEGIN
      DELETE FROM vec_posts WHERE post_id = old.id;
      DELETE FROM post_vectors WHERE post_id = old.id;
      DELETE FROM item_similarity WHERE source = 'vec' AND (post_id = old.id OR similar_id = old.id);
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_vector_invalidated AFTER UPDATE OF title, content ON threads BEGIN
      DELETE FROM recommendation_dirty WHERE post_id=old.id;
      DELETE FROM vector_quarantine WHERE post_id=old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_like AFTER INSERT ON thread_likes
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.user_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.user_id, new.thread_id, 2)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_unlike AFTER DELETE ON thread_likes BEGIN
      DELETE FROM user_interactions WHERE user_id=old.user_id AND post_id=old.thread_id AND action=2;
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_favorite AFTER INSERT ON thread_favorites
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.user_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.user_id, new.thread_id, 4)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_unfavorite AFTER DELETE ON thread_favorites BEGIN
      DELETE FROM user_interactions WHERE user_id=old.user_id AND post_id=old.thread_id AND action=4;
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_reply AFTER INSERT ON replies
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.author_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.author_id, new.thread_id, 3)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_reply_deleted AFTER DELETE ON replies BEGIN
      DELETE FROM user_interactions WHERE user_id=old.author_id AND post_id=old.thread_id AND action=3
        AND NOT EXISTS(SELECT 1 FROM replies WHERE author_id=old.author_id AND thread_id=old.thread_id);
    END;
  `);
  db.transaction(() => {
    if(!db.prepare("SELECT 1 FROM recommendation_meta WHERE key='account-opt-in-v1'").get()) {
      db.exec(`DROP TRIGGER IF EXISTS recommendation_like; DROP TRIGGER IF EXISTS recommendation_favorite; DROP TRIGGER IF EXISTS recommendation_reply;
    CREATE TRIGGER IF NOT EXISTS recommendation_like AFTER INSERT ON thread_likes
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.user_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.user_id, new.thread_id, 2)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_favorite AFTER INSERT ON thread_favorites
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.user_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.user_id, new.thread_id, 4)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;
    CREATE TRIGGER IF NOT EXISTS recommendation_reply AFTER INSERT ON replies
      WHEN EXISTS(SELECT 1 FROM user_experiments WHERE user_id=new.author_id AND recommendations_enabled=1) BEGIN
      INSERT INTO user_interactions(user_id, post_id, action) VALUES(new.author_id, new.thread_id, 3)
        ON CONFLICT(user_id, post_id, action) DO UPDATE SET ts=unixepoch();
    END;

        DELETE FROM user_interactions WHERE user_id NOT IN (SELECT user_id FROM user_experiments WHERE recommendations_enabled=1);
        INSERT INTO recommendation_meta VALUES('account-opt-in-v1','1');`);
    }
    const model = db.prepare("SELECT value FROM recommendation_meta WHERE key='active-model'").get() as {value:string}|undefined;
    if(model?.value !== MODEL_VERSION) {
      db.exec("DELETE FROM vec_posts; DELETE FROM item_similarity WHERE source='vec'; DELETE FROM recommendation_dirty;");
      db.prepare("INSERT INTO vec_posts(post_id,embedding) SELECT post_id,embedding FROM post_vectors WHERE model_version=?").run(MODEL_VERSION);
      db.prepare("INSERT INTO recommendation_dirty SELECT post_id FROM post_vectors WHERE model_version=?").run(MODEL_VERSION);
      db.prepare("INSERT INTO recommendation_meta VALUES('active-model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(MODEL_VERSION);
    }
    if (!db.prepare("SELECT 1 FROM recommendation_meta WHERE key='backfilled-v1'").get()) {
      db.exec(`INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT user_id,thread_id,2 FROM thread_likes WHERE user_id IN (SELECT user_id FROM user_experiments WHERE recommendations_enabled=1);
        INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT user_id,thread_id,4 FROM thread_favorites WHERE user_id IN (SELECT user_id FROM user_experiments WHERE recommendations_enabled=1);
        INSERT OR IGNORE INTO user_interactions(user_id,post_id,action) SELECT DISTINCT author_id,thread_id,3 FROM replies WHERE author_id IN (SELECT user_id FROM user_experiments WHERE recommendations_enabled=1);
        INSERT INTO recommendation_meta VALUES('backfilled-v1','1');`);
    }
  }).immediate();
  }).immediate();
}
