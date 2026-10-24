import { cleanupDraftUploads } from "../lib/upload-cleanup";
import { db } from "../lib/db";
function clean() {
  console.log(`已清理 ${cleanupDraftUploads()} 个过期或孤立上传文件`);
}
clean();
if (process.argv.includes("--watch")) {
  const timer = setInterval(() => {
    try {
      clean();
    } catch (error) {
      console.error("上传清理失败，下次重试", error);
    }
  }, 10 * 60_000);
  const stop = () => {
    clearInterval(timer);
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
} else db.close();
