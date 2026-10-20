import type Database from "better-sqlite3";
import { MODEL_VERSION, DIMENSIONS, TOP_K } from "./config.ts";

export function parseEmbedding(encoded: unknown, version: unknown): { bytes: Buffer; version: string; compatible: boolean } | null {
  if (encoded === undefined || encoded === null || encoded === "") return null;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length !== 4 * Math.ceil(DIMENSIONS * 4 / 3))
    throw new Error("推荐特征格式无效，请重试");
  if (typeof version !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(version)) throw new Error("推荐特征版本无效");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length !== DIMENSIONS * 4) throw new Error("推荐特征维度无效");
  let norm = 0;
  for (let i=0; i<DIMENSIONS; i++) {
    const value = bytes.readFloatLE(i*4);
    if (!Number.isFinite(value)) throw new Error("推荐特征包含无效数值");
    norm += value*value;
  }
  if (Math.abs(norm - 1) > 0.04) throw new Error("推荐特征未归一化");
  return { bytes, version, compatible: version === MODEL_VERSION };
}
export function saveEmbedding(db: Database.Database, postId: number, value: NonNullable<ReturnType<typeof parseEmbedding>>) {
  if (!value.compatible) {
    db.prepare(`INSERT INTO vector_quarantine(post_id,model_version,embedding) VALUES(?,?,?)
      ON CONFLICT(post_id) DO UPDATE SET model_version=excluded.model_version,embedding=excluded.embedding,created_at=unixepoch()`)
      .run(postId,value.version,value.bytes);
    return;
  }
  db.prepare("DELETE FROM vec_posts WHERE post_id=?").run(postId);
  db.prepare("INSERT INTO vec_posts(post_id,embedding) VALUES(CAST(? AS INTEGER),?)").run(postId,value.bytes);
  db.prepare(`INSERT INTO post_vectors(post_id,embedding,model_version) VALUES(?,?,?)
    ON CONFLICT(post_id) DO UPDATE SET embedding=excluded.embedding,model_version=excluded.model_version,updated_at=unixepoch()`)
    .run(postId,value.bytes,MODEL_VERSION);
  db.prepare("INSERT OR IGNORE INTO recommendation_dirty VALUES(?)").run(postId);
  db.prepare("DELETE FROM vector_quarantine WHERE post_id=?").run(postId);
}

/** Only called by the separate batch process. Never from request handlers. */
export function refreshSemantic(db: Database.Database, batch = 20) {
  const started = Date.now();
  const pending = db.prepare(`SELECT d.post_id,p.embedding FROM recommendation_dirty d
    JOIN post_vectors p ON p.post_id=d.post_id WHERE p.model_version=? ORDER BY d.post_id LIMIT ?`)
    .all(MODEL_VERSION, Math.min(100,Math.max(1,batch))) as { post_id:number; embedding:Buffer }[];
  const knn = db.prepare(`SELECT post_id,1-distance AS score FROM vec_posts
    WHERE embedding MATCH ? AND k=CAST(? AS INTEGER) ORDER BY distance`);
  const edge = db.prepare("INSERT OR REPLACE INTO item_similarity(post_id,similar_id,score,source) VALUES(?,?,?,'vec')");
  for (const post of pending) db.transaction(() => {
    db.prepare("DELETE FROM item_similarity WHERE post_id=? AND source='vec'").run(post.post_id);
    const matches = knn.all(post.embedding,TOP_K+1) as {post_id:number;score:number}[];
    for (const match of matches.filter(match => match.post_id !== post.post_id && match.score > 0).slice(0,TOP_K)) {
      edge.run(post.post_id,match.post_id,match.score);
      edge.run(match.post_id,post.post_id,match.score);
      db.prepare(`DELETE FROM item_similarity WHERE post_id=? AND source='vec' AND similar_id IN (
        SELECT similar_id FROM item_similarity WHERE post_id=? AND source='vec' ORDER BY score DESC,similar_id LIMIT -1 OFFSET ?)`)
        .run(match.post_id,match.post_id,TOP_K);
    }
    db.prepare("DELETE FROM recommendation_dirty WHERE post_id=?").run(post.post_id);
  }).immediate();
  db.prepare("INSERT INTO recommendation_jobs(kind,duration_ms,processed) VALUES('semantic',?,?)").run(Date.now()-started,pending.length);
  return pending.length;
}

/** DISTINCT users, recent bounded histories, symmetric edges and per-source TopK. All scoring is SQL. */
export function refreshCollaborative(db: Database.Database) {
  const started = Date.now();
  // The expensive co-occurrence join writes only connection-local TEMP storage. Acquire
  // the main database's write lock for the atomic publication, not for the join.
  db.exec(`CREATE TEMP TABLE IF NOT EXISTS cf_next(post_id INTEGER,similar_id INTEGER,score REAL);
      DELETE FROM cf_next;
      INSERT INTO cf_next
      WITH distinct_posts AS (
        SELECT i.user_id,i.post_id,MAX(i.ts) AS ts FROM user_interactions i
        JOIN threads t ON t.id=i.post_id JOIN users u ON u.id=i.user_id
        JOIN user_experiments e ON e.user_id=i.user_id AND e.recommendations_enabled=1
        WHERE i.action IN (2,3,4) AND i.ts >= unixepoch()-7776000 AND u.banned=0 AND u.status='approved'
        GROUP BY i.user_id,i.post_id
      ), bounded AS (
        SELECT user_id,post_id,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY ts DESC,post_id DESC) AS rn FROM distinct_posts
      ), user_post AS (SELECT user_id,post_id FROM bounded WHERE rn<=200),
      pop AS (SELECT post_id,COUNT(*) AS n FROM user_post GROUP BY post_id),
      pairs AS (
        SELECT a.post_id AS i,b.post_id AS j,COUNT(*) AS n FROM user_post a
        JOIN user_post b ON a.user_id=b.user_id AND a.post_id<b.post_id GROUP BY a.post_id,b.post_id HAVING COUNT(*)>=2
      ), scores AS (
        SELECT pairs.i,pairs.j,1.0*pairs.n/sqrt(a.n*b.n) AS score FROM pairs
        JOIN pop a ON a.post_id=pairs.i JOIN pop b ON b.post_id=pairs.j
      ), symmetric AS (SELECT i,j,score FROM scores UNION ALL SELECT j,i,score FROM scores),
      ranked AS (SELECT i,j,score,ROW_NUMBER() OVER(PARTITION BY i ORDER BY score DESC,j) AS rn FROM symmetric)
      SELECT i,j,score FROM ranked WHERE rn<=50;`);
  db.transaction(() => {
    db.exec(`
      DELETE FROM item_similarity WHERE source='cf';
      INSERT INTO item_similarity SELECT c.post_id,c.similar_id,c.score,'cf' FROM cf_next c
        JOIN threads a ON a.id=c.post_id JOIN threads b ON b.id=c.similar_id;
      DELETE FROM cf_next;
      INSERT INTO recommendation_meta(key,value) VALUES('cf-refreshed',unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value;
      DELETE FROM user_interactions WHERE ts<unixepoch()-7776000;
      DELETE FROM vector_quarantine WHERE created_at<unixepoch()-604800;
      DELETE FROM recommendation_jobs WHERE finished_at<unixepoch()-2592000;`);
  }).immediate();
  const count = (db.prepare("SELECT COUNT(*) n FROM item_similarity WHERE source='cf'").get() as {n:number}).n;
  db.prepare("INSERT INTO recommendation_jobs(kind,duration_ms,processed) VALUES('cf',?,?)").run(Date.now()-started,count);
  return count;
}
