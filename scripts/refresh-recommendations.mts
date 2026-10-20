// Separate background process. Node >=22.18; no encoder and no Python runtime.
import Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { initializeRecommendations } from "../lib/recommendation/schema.ts";
import { refreshSemantic, refreshCollaborative } from "../lib/recommendation/store.ts";
import { MODEL_VERSION } from "../lib/recommendation/config.ts";
const filename = join(process.env.HSFZ_DATA_DIR || resolve("data"),"bbs.db");
const db = new Database(filename,{fileMustExist:true});
db.pragma("journal_mode = WAL"); db.pragma("busy_timeout = 5000");
initializeRecommendations(db);
const args = new Set(process.argv.slice(2));
let stopped=false;
process.on("SIGINT",()=>{stopped=true});process.on("SIGTERM",()=>{stopped=true});
try {
  do {
    const previousFull = db.prepare("SELECT value FROM recommendation_meta WHERE key='semantic-full-refreshed'").get() as {value:string}|undefined;
    const full = args.has("--full") || (args.has("--watch") && new Date().getUTCHours()===3 &&
      (!previousFull || Number(previousFull.value)<Date.now()/1000-82800));
    if (full) db.prepare("INSERT OR IGNORE INTO recommendation_dirty SELECT post_id FROM post_vectors WHERE model_version=?").run(MODEL_VERSION);
    let processed = refreshSemantic(db);
    if (full) {
      let batch=processed;
      while(batch===20 && !stopped) { batch=refreshSemantic(db); processed+=batch; }
      if (!stopped) db.prepare("INSERT INTO recommendation_meta VALUES('semantic-full-refreshed',unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
    }
    const last = db.prepare("SELECT value FROM recommendation_meta WHERE key='cf-refreshed'").get() as {value:string}|undefined;
    const collaborative = args.has("--cf") || !last || Number(last.value)<Date.now()/1000-604800 ? refreshCollaborative(db) : undefined;
    console.log(JSON.stringify({processed,collaborative,metrics:db.prepare("SELECT * FROM recommendation_jobs ORDER BY id DESC LIMIT 5").all(),pending:db.prepare("SELECT COUNT(*) n FROM recommendation_dirty").get()}));
    if (!args.has("--watch")) break;
    // Small sleeps allow a prompt shutdown; this worker is independent of the web server.
    for(let i=0;i<60 && !stopped;i++) await new Promise(r=>setTimeout(r,1000));
  } while(!stopped);
} finally { db.close(); }
