import { db } from "./db";
import { INLINE_DIR, type InlineRow } from "./inline-uploads";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
/** Serialize cleanup with publishing so a file cannot be claimed while removed. */
export function cleanupDraftUploads(now = Date.now()): number {
  return db
    .transaction(() => {
      let removed = 0;
      for (const row of db
        .prepare("SELECT * FROM inline_uploads WHERE thread_id=0 AND expires<?")
        .all(now) as InlineRow[]) {
        try {
          unlinkSync(path.join(INLINE_DIR, row.file));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        db.prepare("DELETE FROM inline_uploads WHERE id=?").run(row.id);
        removed++;
      }
      if (existsSync(INLINE_DIR))
        for (const name of readdirSync(INLINE_DIR)) {
          if (
            !/^(?:inline-[a-f0-9]{32}\.(?:png|jpg|webp|gif)|[a-f0-9]{32}\.bin)$/.test(
              name,
            )
          )
            continue;
          if (db.prepare("SELECT 1 FROM inline_uploads WHERE file=?").get(name))
            continue;
          const file = path.join(INLINE_DIR, name);
          if (statSync(file).mtimeMs < now - 86400000) {
            unlinkSync(file);
            removed++;
          }
        }
      return removed;
    })
    .immediate();
}
