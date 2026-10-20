import { db } from "../db";
import { CANDIDATE_LIMIT, MODEL_VERSION, RECENT_LIMIT } from "./config";
import type { ThreadRow } from "../queries";

export type Candidate = ThreadRow & { vector: string | null };
export type Similarity = { post_id:number; similar_id:number; score:number; source:"vec"|"cf" };
export function candidatePool(ids?: number[]): Candidate[] {
  // The only ordering on this request path is the indexed creation-time scan; no user scoring.
  const pool = ids ? `SELECT id FROM threads WHERE id IN (SELECT value FROM json_each(?))` :
    `SELECT id FROM threads ORDER BY created_at DESC,id DESC LIMIT ?`;
  const result = db.prepare(`WITH pool AS (${pool}) SELECT t.id,t.board_id,CASE WHEN t.anonymous=1 THEN 0 ELSE t.author_id END AS author_id,
    t.title,substr(t.content,1,500) AS content,t.images,t.anonymous,t.views,t.reply_count,t.is_pinned,t.is_featured,
    t.created_at,t.last_reply_at,b.slug,b.name AS board_name,b.icon AS board_icon,b.grade_lock,
    CASE WHEN t.anonymous=1 THEN '匿名同学' ELSE u.nickname END AS author_name,
    CASE WHEN t.anonymous=1 THEN '' ELSE u.username END AS author_username,
    CASE WHEN t.anonymous=1 THEN '' ELSE u.avatar END AS author_avatar,
    CASE WHEN t.anonymous=1 THEN '' ELSE u.custom_title END AS author_title,
    (SELECT COUNT(*) FROM thread_likes l WHERE l.thread_id=t.id) AS like_count,
    p.embedding FROM pool JOIN threads t ON t.id=pool.id JOIN boards b ON b.id=t.board_id
    JOIN users u ON u.id=t.author_id LEFT JOIN post_vectors p ON p.post_id=t.id AND p.model_version=?
    WHERE u.status='approved' AND u.banned=0`)
    .all(ids ? JSON.stringify(ids) : CANDIDATE_LIMIT, MODEL_VERSION) as (ThreadRow & {embedding:Buffer|null})[];
  return result.map(({embedding,...post}) => ({...post,vector:embedding?.toString("base64") ?? null}));
}
export function similarityEdges(ids: number[]): Similarity[] {
  if (!ids.length) return [];
  return db.prepare(`SELECT s.* FROM item_similarity s JOIN threads t ON t.id=s.similar_id
    JOIN users u ON u.id=t.author_id WHERE s.post_id IN (${ids.map(()=>"?").join(",")})
    AND u.status='approved' AND u.banned=0 ORDER BY s.post_id,s.source,s.score DESC`)
    .all(...ids.slice(0,RECENT_LIMIT)) as Similarity[];
}
export function recordViews(userId: number, postIds: number[]) {
  const insert = db.prepare(`INSERT INTO user_interactions(user_id,post_id,action)
    SELECT ?,id,1 FROM threads WHERE id=? AND EXISTS(SELECT 1 FROM user_experiments WHERE user_id=? AND recommendations_enabled=1)
    ON CONFLICT(user_id,post_id,action) DO UPDATE SET ts=unixepoch()
    WHERE user_interactions.ts<unixepoch()-3600`);
  db.transaction(() => { for (const id of postIds) insert.run(userId,id,userId); })();
}
