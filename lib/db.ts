import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fmtDate } from "./format";

const DATA_DIR = process.env.HSFZ_DATA_DIR || path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
export { UPLOAD_DIR };

const g = globalThis as unknown as { __bbsDb?: Database.Database };
export const db = g.__bbsDb ?? new Database(path.join(DATA_DIR, "bbs.db"));
g.__bbsDb = db;

db.pragma("journal_mode = WAL");

// Upgrade the upstream recipient/is_read schema atomically before creating indexes.
const initializeSchema = db.transaction(() => {
  const columns = db.prepare("PRAGMA table_info(direct_messages)").all() as { name: string }[];
  const legacy = columns.some(column => column.name === "recipient_id") && !columns.some(column => column.name === "conversation_id");
  if (legacy) db.exec("ALTER TABLE direct_messages RENAME TO direct_messages_legacy_upgrade");
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'approved',
  reject_reason TEXT DEFAULT '',
  banned INTEGER DEFAULT 0,
  custom_title TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '💬',
  category TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  grade_lock TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT DEFAULT '',
  anonymous INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT '',
  last_reply_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  images TEXT DEFAULT '',
  reply_to INTEGER DEFAULT 0,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS thread_likes (
  user_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
CREATE TABLE IF NOT EXISTS thread_favorites (
  user_id INTEGER NOT NULL,
  thread_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, thread_id)
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  user_read_at TEXT DEFAULT '',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  is_admin INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT '',
  actor_id INTEGER DEFAULT 0,
  thread_id INTEGER DEFAULT 0,
  reply_id INTEGER DEFAULT 0,
  content TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at TEXT DEFAULT '',
  UNIQUE(follower_id, following_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  blocked_id INTEGER NOT NULL,
  created_at TEXT DEFAULT '',
  UNIQUE(user_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS guest_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT DEFAULT '',
  contact TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  real_name TEXT NOT NULL,
  student_id TEXT UNIQUE NOT NULL,
  grade TEXT DEFAULT '',
  used_by INTEGER DEFAULT 0,
  created_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS direct_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_low INTEGER NOT NULL REFERENCES users(id),
  user_high INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  CHECK (user_low < user_high),
  UNIQUE (user_low, user_high)
);
CREATE TABLE IF NOT EXISTS direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES direct_conversations(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  attachment_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation ON direct_messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS direct_reads (
  conversation_id INTEGER NOT NULL REFERENCES direct_conversations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  last_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES community_groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  joined_at TEXT NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS group_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES community_groups(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  attachment_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_messages_group ON group_messages(group_id, id);
CREATE TABLE IF NOT EXISTS chat_attachments (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  payload BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_attachments_expiry ON chat_attachments(expires_at);
`);
  if (legacy) {
    db.exec(`
      INSERT INTO direct_conversations (user_low, user_high, created_at)
      SELECT MIN(sender_id, recipient_id), MAX(sender_id, recipient_id), MIN(created_at)
      FROM direct_messages_legacy_upgrade
      GROUP BY MIN(sender_id, recipient_id), MAX(sender_id, recipient_id);
      INSERT INTO direct_messages (id, conversation_id, sender_id, content, created_at)
      SELECT m.id, c.id, m.sender_id, m.content, m.created_at
      FROM direct_messages_legacy_upgrade m JOIN direct_conversations c
        ON c.user_low = MIN(m.sender_id, m.recipient_id) AND c.user_high = MAX(m.sender_id, m.recipient_id)
      ORDER BY m.id;
      INSERT INTO direct_reads (conversation_id, user_id, last_message_id)
      SELECT c.id, m.recipient_id, MAX(m.id)
      FROM direct_messages_legacy_upgrade m JOIN direct_conversations c
        ON c.user_low = MIN(m.sender_id, m.recipient_id) AND c.user_high = MAX(m.sender_id, m.recipient_id)
      WHERE m.is_read = 1 GROUP BY c.id, m.recipient_id;
      DROP TABLE direct_messages_legacy_upgrade;
    `);
  }
});
initializeSchema.immediate();

// Add attachment references without rewriting existing conversations.
for (const table of ["direct_messages", "group_messages"]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some(column => column.name === "attachment_id")) {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN attachment_id TEXT NOT NULL DEFAULT ''`); }
    catch (error) {
      // Another worker may have completed the same migration while this worker waited.
      const current = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!current.some(column => column.name === "attachment_id")) throw error;
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS ${table}_attachment ON ${table}(attachment_id) WHERE attachment_id != ''`);
}
// Zero freed BLOB pages; expired uploads should not remain in SQLite's free list.
db.pragma("secure_delete = ON");

// 早期数据库无 grade 列，补一次迁移
try {
  db.exec("ALTER TABLE users ADD COLUMN grade TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE boards ADD COLUMN grade_lock TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE threads ADD COLUMN images TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE threads ADD COLUMN anonymous INTEGER DEFAULT 0");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE replies ADD COLUMN images TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE replies ADD COLUMN reply_to INTEGER DEFAULT 0");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}
try {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''");
} catch {
  /* 列已存在则忽略 */
}

/* 后补板块迁移：年级群（仅本年级同学可发言）+ 考试交流 */
function ensureGradeBoards() {
  const groups: Array<[string, string, string, string, number, string]> = [
    // slug, name, description, icon, sort, grade_lock
    ["chu1", "初一专区", "初一同学的年级群：适应初中、社团、趣事分享", "🌻", 15, "初一"],
    ["chu2", "初二专区", "初二同学的年级群：课业、活动、青春烦恼", "🐬", 16, "初二"],
    ["chu3", "初三专区", "初三同学的年级群：中考备考、互相打气", "🚀", 17, "初三"],
    ["gao1", "高一专区", "高一同学的年级群：日常、课业、社团、吐槽都在这", "🌱", 21, "高一"],
    ["gao2", "高二专区", "高二同学的年级群：选科、竞赛、活动第一线", "🌿", 22, "高二"],
    ["gao3", "高三专区", "高三同学的年级群：备考互助、情报交流、互相打气", "🌳", 23, "高三"],
    ["biye", "毕业生专区", "毕业不离散：大学职场见闻、返校聚会、老友重逢", "🎒", 24, "已毕业"],
  ];
  const ins = db.prepare(
    `INSERT INTO boards (slug, name, description, icon, category, sort, grade_lock)
     VALUES (?, ?, ?, ?, '年级群', ?, ?)`
  );
  for (const [slug, name, desc, icon, sort, lock] of groups) {
    if (db.prepare("SELECT id FROM boards WHERE slug = ?").get(slug)) continue;
    ins.run(slug, name, desc, icon, sort, lock);
  }
  // 学习成长：考试交流、文学创作
  if (!db.prepare("SELECT id FROM boards WHERE slug = ?").get("exams")) {
    db.prepare(
      `INSERT INTO boards (slug, name, description, icon, category, sort)
       VALUES ('exams', '考试交流', '期中期末、周测月考的备考经验、题目讨论与考后吐槽', '📝', '学习成长', 15)`
    ).run();
  }
  if (!db.prepare("SELECT id FROM boards WHERE slug = ?").get("literature")) {
    db.prepare(
      `INSERT INTO boards (slug, name, description, icon, category, sort)
       VALUES ('literature', '文学创作', '散文、诗歌、小说——写下属于你的故事', '✍️', '学习成长', 16)`
    ).run();
  }
  // 游戏分区：游戏讨论
  if (!db.prepare("SELECT id FROM boards WHERE slug = ?").get("games")) {
    db.prepare(
      `INSERT INTO boards (slug, name, description, icon, category, sort)
       VALUES ('games', '游戏讨论', '聊你喜欢的游戏，组队开黑、攻略交流', '🎮', '游戏', 58)`
    ).run();
  }
}

/* 后补板块迁移：球友分类（老数据库没有则插入，并各送一条示例帖） */
function ensureSportsBoards() {
  const sports: Array<[string, string, string, string, number, string, string]> = [
    // slug, name, description, icon, sort, 作者, 示例帖标题
    ["basketball", "篮球", "约球、训练、班赛", "🏀", 52, "chen2026", "周五晚体育馆 3v3，还缺一个内线，来！"],
    ["football", "足球", "约战、训练、一起看球", "⚽", 53, "wang2028", "高一足球小队组队中，周末约友谊赛"],
    ["cricket", "板球", "华附传统强项：训练与招新", "🏏", 54, "lin2027", "板球社新学期训练时间表出炉（欢迎新人）"],
    ["badminton", "羽毛球", "约球、夜羽、装备交流", "🏸", 55, "su2027", "夜羽常驻名单更新：每周三、五晚"],
    ["tabletennis", "乒乓球", "约战与技术交流", "🏓", 56, "liu2026", "乒乓区新到两块胶皮，放学来试打"],
    ["volleyball", "排球", "气排 / 硬排，约球训练", "🏐", 57, "su2027", "周日早上气排球局，体育馆见"],
    ["tennis", "网球", "网球约球与训练交流", "🎾", 58, "chen2026", "网球场周三晚有局，缺两人"],
    ["pickleball", "匹克球", "新兴网红球类，一起来玩", "🥒", 59, "wang2028", "匹克球新手局：周日体育馆侧厅"],
  ];
  const insBoard = db.prepare(
    "INSERT INTO boards (slug, name, description, icon, category, sort) VALUES (?, ?, ?, ?, '球友', ?)"
  );
  const insThread = db.prepare(
    `INSERT INTO threads (board_id, author_id, title, content, views, created_at, last_reply_at)
     VALUES (?, ?, ?, ?, ?, datetime('now','localtime','-1 day'), datetime('now','localtime','-1 day'))`
  );
  for (const [slug, name, desc, icon, sort, author, title] of sports) {
    if (db.prepare("SELECT id FROM boards WHERE slug = ?").get(slug)) continue;
    const boardInfo = insBoard.run(slug, name, desc, icon, sort);
    const bid = Number(boardInfo.lastInsertRowid);
    const uidRow = db.prepare("SELECT id FROM users WHERE username = ?").get(author) as
      | { id: number }
      | undefined;
    if (!uidRow) continue;
    insThread.run(
      bid,
      uidRow.id,
      title,
      `本板块为「${name}」板块示例帖。约球请写清时间、地点、水平要求，注意安全，友谊第一！`,
      60 + Math.floor(Math.random() * 80)
    );
  }
}

/* ---------------- 种子数据 ---------------- */

const hash = (p: string) => bcrypt.hashSync(p, 10);
const NOW = Date.now();

function ts(daysAgo: number, minutesFromMidnight = 600): string {
  const d = new Date(NOW - daysAgo * 86400000);
  d.setHours(Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60, 0, 0);
  return fmtDate(d);
}
function after(dateStr: string, hours: number): string {
  const t = new Date(dateStr.replace(" ", "T")).getTime() + hours * 3600000;
  return fmtDate(new Date(Math.min(t, NOW - 60000)));
}

function seed() {
  if ((db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c > 0) return;

  /* 用户 */
  const users: Array<[string, string, string, string, string, string, string, string, string]> = [
    // username, password, nickname, bio, role, status, custom_title, grade, created
    ["admin", "admin123", "BBS 站务组", "华南师范大学附属中学官方校园论坛。有问题请到「我的消息」发工单。", "admin", "approved", "站长", "", ts(30, 480)],
    ["zhang2025", "123456", "张远航", "25 届毕业 | 现就读于北大数院，常回来看看大家。", "user", "approved", "奥数国家集训队", "已毕业", ts(28, 900)],
    ["su2027", "123456", "苏晚晴", "高二 | 摄影社成员，校园回忆收藏家。", "user", "approved", "", "高二", ts(27, 1000)],
    ["chen2026", "123456", "陈一鸣", "高三 | 物竞选手，数理化都能聊。", "user", "approved", "", "高三", ts(26, 850)],
    ["liu2026", "123456", "刘知味", "高三 | 校园美食雷达，减肥是不可能减肥的。", "user", "approved", "食堂鉴定师", "高三", ts(26, 1100)],
    ["lin2027", "123456", "林小满", "高二 | 板球与辩论，占满我的周末。", "user", "approved", "板球队长", "高二", ts(25, 950)],
    ["wang2028", "123456", "阿旺", "高一萌新，请多关照！", "user", "approved", "", "高一", ts(10, 800)],
    ["pending2028", "123456", "待审核同学", "想加入华附 BBS 与大家交流！", "user", "pending", "", "高一", ts(1, 930)],
  ];
  const insUser = db.prepare(
    `INSERT INTO users (username, password_hash, nickname, bio, role, status, custom_title, grade, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const uid: Record<string, number> = {};
  for (const [u, p, n, b, role, status, title, grade, at] of users) {
    const info = insUser.run(u, hash(p), n, b, role, status, title, grade, at);
    uid[u] = Number(info.lastInsertRowid);
  }

  /* 板块 */
  const boards: Array<[string, string, string, string, string, number]> = [
    ["study", "学习互助", "学科问答、资料分享、组队自习", "📚", "学习成长", 10],
    ["competition", "竞赛升学", "学科竞赛、强基综评、升学经验", "🏆", "学习成长", 20],
    ["food", "美食推荐", "食堂测评、周边探店、零食安利", "🍜", "生活娱乐", 30],
    ["clubs", "社团活动", "社团招新、活动发布、演出比赛", "🎭", "生活娱乐", 40],
    ["chat", "校园闲聊", "日常水贴、趣事分享、每日话题", "💬", "生活娱乐", 50],
    ["market", "跳蚤市场", "二手教材、用品与计算器交易", "🛒", "交易互助", 60],
    ["lostfound", "失物招领", "丢了什么、捡到什么，都在这里", "🧳", "交易互助", 70],
    ["memories", "校园回忆", "老照片、老故事，华附人的共同回忆", "🏫", "情感联结", 80],
    ["alumni", "校友交流", "校友动态、职业分享、返校联络", "🎓", "情感联结", 90],
    ["announcements", "站务公告", "论坛公告、规则与官方通知（仅管理员可发）", "📢", "官方", 100],
  ];
  const insBoard = db.prepare(
    `INSERT INTO boards (slug, name, description, icon, category, sort) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const bid: Record<string, number> = {};
  for (const [slug, name, desc, icon, cat, sort] of boards) {
    const info = insBoard.run(slug, name, desc, icon, cat, sort);
    bid[slug] = Number(info.lastInsertRowid);
  }

  /* 帖子 */
  type R = { u: string; c: string; h?: number };
  type T = {
    b: string; u: string; t: string; c: string; d: number; m?: number;
    pin?: boolean; feat?: boolean; views?: number; r?: R[];
  };
  const threads: T[] = [
    {
      b: "announcements", u: "admin", t: "HSFZ BBS 社区公约（发帖前必读）", d: 15, m: 540, pin: true, feat: true, views: 620,
      c: "欢迎来到 HSFZ BBS！为了让论坛保持友善与秩序，请遵守以下公约：\n\n1. 实名注册、一人一号，注册后需等待管理员审核；\n2. 尊重每一位同学，禁止人身攻击、地域与身高外貌歧视；\n3. 跳蚤市场交易请线下当面验货，论坛不承担交易风险；\n4. 禁止发布广告、刷屏、泄题等内容；\n5. 遇到问题通过「我的消息」联系管理员。\n\n祝大家在这里找到同好、解决困惑，也留下美好的校园记忆。",
      r: [
        { u: "zhang2025", c: "遵守公约，文明发帖。毕业多年也会常回来看看的。", h: 3 },
        { u: "wang2028", c: "收到！萌新已认真读完~", h: 20 },
      ],
    },
    {
      b: "announcements", u: "admin", t: "新功能上线：自定义头像与专属头衔", d: 8, m: 600, feat: true, views: 388,
      c: "本次更新：\n\n· 头像上传：在「账号设置」中上传自己的头像（支持 JPG/PNG/WEBP，2MB 以内）；\n· 专属头衔：管理员可为活跃或有贡献的同学授予专属头衔，金光闪闪那种；\n· 等级头衔：发帖与回帖达到一定数量会自动升级（新入校 → 校园新人 → 活跃同学 → 校园达人 → 传奇学长）。\n\n想要头衔？去「我的消息」提交一张头衔申请工单吧。",
      r: [
        { u: "liu2026", c: "头衔好用！已经挂上「食堂鉴定师」了哈哈", h: 2 },
        { u: "su2027", c: "头像终于能换啦，这就把摄影社的写真传上来", h: 5 },
      ],
    },
    {
      b: "announcements", u: "admin", t: "关于规范「跳蚤市场」板块的说明", d: 5, m: 720, views: 233,
      c: "近期发现跳蚤市场存在闲聊灌水与交易纠纷隐患，重申：\n\n1. 交易帖需注明物品成色与价格，成交后请回帖说明；\n2. 大额交易建议当面验货；\n3. 禁止代购、募捐等非二手交易内容。\n\n感谢配合！",
      r: [{ u: "chen2026", c: "支持，当面验货最稳。", h: 4 }],
    },

    {
      b: "study", u: "chen2026", t: "求推荐：高中数学导数专题练习册", d: 6, m: 580, views: 205,
      c: "一轮复习快开始了，想在导数上多下点功夫。有没有刷过觉得编排合理的练习册推荐？最好带详细解析，适合自学的。",
      r: [
        { u: "zhang2025", c: "《高中数学培优·导数专项》，当年陪我刷完整个高三，解析步骤很全。", h: 2 },
        { u: "lin2027", c: "我们班好几个人在用《更高更妙的高中数学》，题型归纳很清楚。", h: 6 },
        { u: "wang2028", c: "同问！顺便蹲一个二手的，跳蚤市场看到了来吱一声", h: 9 },
      ],
    },
    {
      b: "study", u: "lin2027", t: "英语读后续写 18 → 22 分经验（附句型积累法）", d: 4, m: 640, views: 176,
      c: "方法分享：每天精读一篇范文，把「动作描写」「情绪描写」「环境烘托」三类句子分类抄进积累表，早读拿出来读 10 分钟。\n\n坚持一个月后，最明显的变化是下笔不再只会写 He said happily...\n\n需要积累表模板的评论区吱一声。",
      r: [
        { u: "su2027", c: "模板求分享！谢谢楼主", h: 1 },
        { u: "chen2026", c: "mark，下周模考前拜读", h: 3 },
        { u: "liu2026", c: "22 分大佬带带我", h: 7 },
      ],
    },
    {
      b: "study", u: "wang2028", t: "左手定则右手定则总是搞混，求一个好记的办法", d: 3, m: 700, views: 98,
      c: "如题，电磁感应一做到判断方向的题就懵，有没有大佬来救救孩子。",
      r: [
        { u: "chen2026", c: "口诀：左手电动机（受力），右手发电机（发电）。判断安培力用左手，判断感应电流用右手。", h: 2 },
        { u: "zhang2025", c: "口诀只是拐杖，多刷几道电磁感应题形成肌肉记忆才是根本。", h: 8 },
      ],
    },
    {
      b: "study", u: "liu2026", t: "分享：自己整理的高中化学常用方程式汇总", d: 2, m: 760, views: 154,
      c: "熬了三个晚自习整理的，按金属 / 非金属 / 有机分类，标注了常考条件。\n\n评论区提意见，我继续改。",
      r: [
        { u: "wang2028", c: "楼主是天使！已收藏", h: 1 },
        { u: "lin2027", c: "排版太舒服了，感谢分享", h: 4 },
      ],
    },

    {
      b: "competition", u: "wang2028", t: "物理竞赛和数学竞赛怎么选？想听听学长学姐的建议", d: 7, m: 620, views: 240,
      c: "开学招新两边的宣讲都听了，都很心动。想问问过来人：从兴趣、时间投入和升学作用来看，应该怎么选？",
      r: [
        { u: "zhang2025", c: "看兴趣更看耐心：数学靠长期积累体系，上手慢但越学越深；物理上手快，对建模和计算能力要求高。\n\n建议先各听两周入门课再定。我当年选数学，是因为喜欢想通一题爽一整天的感觉。", h: 3 },
        { u: "chen2026", c: "还要看跟的教练风格，可以先去旁听两边的教学计划再决定。", h: 7 },
      ],
    },
    {
      b: "competition", u: "chen2026", t: "2026 强基计划时间线整理（报名 / 初审 / 校测）", d: 5, m: 660, feat: true, views: 310,
      c: "帮大家整理了强基计划的关键节点：\n\n· 3 月底 - 4 月初：各校发布招生简章\n· 4 月：网上报名（别拖到最后一天）\n· 5 月底：报名截止 + 高考前冲刺\n· 6 月下旬：高考出分后确定校测名单\n· 7 月初：校测（笔试 + 面试）\n\n提醒：强基看综合成绩，高考分数仍然是大头，别顾此失彼。",
      r: [
        { u: "lin2027", c: "收藏了，希望明年用得上", h: 2 },
        { u: "su2027", c: "学长太靠谱了", h: 5 },
      ],
    },
    {
      b: "competition", u: "lin2027", t: "高二零基础开始搞信息学奥赛，还来得及吗？", d: 2, m: 680, views: 132,
      c: "纯文科心但最近对编程突然上头……现在开始学会不会太晚？想听真实的声音，不要太安慰式的。",
      r: [
        { u: "zhang2025", c: "来得及，但要有心理准备：前面半年都在补语法和基础算法，正反馈很慢。关键是尽快开始刷题，别停留在看课。", h: 4 },
        { u: "wang2028", c: "一起加油！我也刚开始", h: 10 },
      ],
    },

    {
      b: "food", u: "liu2026", t: "食堂二楼新出的滑蛋饭，本周必吃清单第一名", d: 3, m: 690, views: 288,
      c: "蛋超嫩，酱汁给得足，12 块钱这个质量真的可以。今天 12:10 去已经开始排队了，想去建议早点冲。",
      r: [
        { u: "wang2028", c: "哪个窗口？！明天就去", h: 1 },
        { u: "su2027", c: "拍过照了，确实好看，味道也没让人失望", h: 3 },
        { u: "chen2026", c: "排队值不值？午休时间紧张啊", h: 6 },
      ],
    },
    {
      b: "food", u: "liu2026", t: "校门口牛杂铺隐藏吃法：加辣 + 萝卜换面筋", d: 6, m: 750, views: 199,
      c: "周五放学实测：加辣之后汤底层次直接上一个档次，面筋比萝卜更挂汁。\n\n别问，问就是吃了三年总结出来的。",
      r: [
        { u: "su2027", c: "被你安利成功了，昨天去试了，绝", h: 5 },
        { u: "lin2027", c: "老板娘认识你了都要给你办会员卡了吧", h: 9 },
      ],
    },
    {
      b: "food", u: "lin2027", t: "求推荐：班级聚餐 15 人左右、人均 40 以内的店", d: 1, m: 800, views: 87,
      c: "班委群让我找地方， requirements：能坐 15 人、人均 40 内、离学校别太远。求大家推荐！",
      r: [
        { u: "liu2026", c: "东门那家烧腊快餐有大圆桌，拼桌炆猪手很顶", h: 2 },
        { u: "su2027", c: "披萨自助也行，人均 39，同学生日都爱去那", h: 4 },
        { u: "zhang2025", c: "我们那年常去的老店还开着，看到这帖突然想回去了", h: 12 },
      ],
    },

    {
      b: "clubs", u: "su2027", t: "九月社团招新全攻略：47 个社团一帖看懂", d: 9, m: 560, feat: true, views: 452,
      c: "一年一度的百团大战要来了！先帮大家分个类：\n\n· 学术科技类：信息学、机器人、天文社……\n· 文艺类：摄影社、文学社、街舞社、合唱团\n· 体育类：板球、篮球、羽毛球、剑道\n· 公益实践类：志愿者协会、环保社\n· 兴趣类：桌游社、动漫社、美食社\n\n招新时间：下周五下午操场，记得带上热情（和防晒）。",
      r: [
        { u: "wang2028", c: "信息量好大！已决定先冲摄影社", h: 2 },
        { u: "lin2027", c: "辩论队也在这里面，欢迎来面！", h: 4 },
        { u: "chen2026", c: "当年我就是看攻略进的篮球社，时间过得真快", h: 26 },
      ],
    },
    {
      b: "clubs", u: "chen2026", t: "篮球社周五常规训练恢复，新老成员欢迎来玩", d: 4, m: 730, views: 121,
      c: "期中考完终于恢复训练了！每周五下午 4 点半室内球场，先热身再分组打全场。没有基础要求，来出汗就行。",
      r: [
        { u: "wang2028", c: "想加！需要自带球吗", h: 2 },
        { u: "lin2027", c: "上周路过球场，气氛确实好", h: 8 },
      ],
    },
    {
      b: "clubs", u: "lin2027", t: "辩论队纳新面试真题回忆版（持续更新）", d: 2, m: 780, views: 143,
      c: "整理了今年面试被问到的题：\n\n1. 「外卖进校园」是利大于弊还是弊大于利？\n2. 如果可以预知毕业日期，你想不想要这个能力？\n3. 即兴：用一句话推销你的笔袋。\n\n面试看重的是临场反应，不是立场正确。",
      r: [
        { u: "su2027", c: "同场面试的来补充两题", h: 3 },
        { u: "wang2028", c: "先背为敬", h: 6 },
      ],
    },

    {
      b: "market", u: "chen2026", t: "转让：图形计算器 TI-84，9.5 成新带保护壳", d: 4, m: 710, views: 167,
      c: "竞赛方向调整用不上了，功能完好无维修，附说明书和保护壳。\n\n教学楼后面当面交易，可现场验机。",
      r: [
        { u: "wang2028", c: "想要！什么价？", h: 1 },
        { u: "lin2027", c: "蹲一个成色图", h: 5 },
      ],
    },
    {
      b: "market", u: "wang2028", t: "全新营服 L 码转让（买错尺码了）", d: 2, m: 820, views: 76,
      c: "如题，吊牌都没拆，原价出，可小刀。课间在高三楼找我都行。",
      r: [
        { u: "liu2026", c: "帮室友问：能试穿吗", h: 2 },
        { u: "su2027", c: "已私聊", h: 3 },
      ],
    },
    {
      b: "market", u: "su2027", t: "低价出一批课外书：《三体》《平凡的世界》等 12 本", d: 1, m: 860, views: 94,
      c: "搬家清书架，全部 5 折起，成色见图。先到先得，可拆买。",
      r: [
        { u: "chen2026", c: "三体还留吗？", h: 1 },
        { u: "zhang2025", c: "书留得好好的就是最好的传承，支持", h: 7 },
      ],
    },

    {
      b: "lostfound", u: "wang2028", t: "捡到校卡一张（姓名带「晓」字），失主来认领", d: 2, m: 740, views: 110,
      c: "中午在食堂三楼捡到的，已交给楼下小卖部阿姨保管，失主看到请去认领，描述一下卡套特征就行。",
      r: [
        { u: "lin2027", c: "好像是我同桌！让她课间去找你", h: 1 },
        { u: "su2027", c: "楼主好人", h: 2 },
      ],
    },
    {
      b: "lostfound", u: "lin2027", t: "体育馆丢了一只黑色笔袋（贴满贴纸），有偿感谢", d: 3, m: 770, views: 88,
      c: "周三下午体育课落在体育馆看台了，回去找没了。笔袋上有一只很显眼的柴犬贴纸。有偿感谢！",
      r: [
        { u: "wang2028", c: "帮你在楼道群问了，有消息吱声", h: 2 },
        { u: "chen2026", c: "去失物招领处登记了吗", h: 5 },
      ],
    },
    {
      b: "lostfound", u: "zhang2025", t: "操场西边捡到 AirPods 左耳一只，可描述特征认领", d: 8, m: 830, views: 132,
      c: "返校日那天在操场西边跑道捡到的，先帮我保管着。失主请私信描述外壳划痕特征来认领。",
      r: [
        { u: "liu2026", c: "毕业学长办事就是靠谱", h: 3 },
        { u: "su2027", c: "已转给可能丢失的同学", h: 6 },
      ],
    },

    {
      b: "memories", u: "zhang2025", t: "毕业五年，最怀念的还是校运会那场 4×100 接力", d: 10, m: 590, feat: true, views: 365,
      c: "整理相册翻到 2019 年校运会的照片。那年我们班接力赛最后一棒反超了 0.3 秒，全班冲进内场喊到嗓子哑。\n\n后来才知道，青春里最珍贵的不是奖状，是那一群人真的为同一件事拼过。\n\n今年的校运会，替我多喊两声。",
      r: [
        { u: "su2027", c: "看哭了……去年站上同一条跑道的我瞬间破防", h: 2 },
        { u: "liu2026", c: "那年我在终点线边上卖矿泉水（雾）", h: 4 },
        { u: "chen2026", c: "今年校运会我也会在接力的跑道上！", h: 20 },
      ],
    },
    {
      b: "memories", u: "su2027", t: "老照片翻出来：教学楼下的橘猫「主任」", d: 5, m: 640, views: 210,
      c: "借修图课翻档案的时候看到的，2016 年的「主任」，蹲在同一级台阶上。\n\n一晃这么多年，主任还是主任，我们一届一届毕业。",
      r: [
        { u: "wang2028", c: "主任还在！上周还看见它在花坛晒太阳", h: 2 },
        { u: "lin2027", c: "主任：朕的校园，朕的猫", h: 5 },
      ],
    },
    {
      b: "memories", u: "chen2026", t: "写给我高一的自己：别怕，慢慢来", d: 1, m: 880, views: 96,
      c: "高一第一次月考砸了，躲在被子里给现在的自己写信：\n\n别怕，慢慢来。三年很长，够你把不会的都学会；三年也很短，短到要抓紧和喜欢的人做喜欢的事。",
      r: [
        { u: "su2027", c: "看完顺手转给了刚入学的妹妹", h: 2 },
        { u: "wang2028", c: "刚好是现在的我，谢谢你", h: 3 },
      ],
    },

    {
      b: "alumni", u: "zhang2025", t: "从华附到北大数院：给准备强基的学弟学妹 10 条建议", d: 12, m: 600, feat: true, views: 401,
      c: "1. 高考成绩是大头，竞赛是加分项不是替代品；\n2. 错题本的核心是「错误原因」不是题目本身；\n3. 面试时诚实比讨巧加分——不会就说不会；\n4. 别熬夜刷题，效率崩了什么都白搭；\n5. 找到同路人，比找到好资料更重要；\n……（后 5 条太长，详见图片版，评论区继续聊）",
      r: [
        { u: "chen2026", c: "第 2 条关于错题本的建议太真实了", h: 3 },
        { u: "lin2027", c: "转发到班群了，感谢学长", h: 6 },
        { u: "wang2028", c: "未来学长我也是（立 flag）", h: 30 },
      ],
    },
    {
      b: "alumni", u: "zhang2025", t: "校友访谈 vol.7：一位临床医生的一天", d: 6, m: 700, views: 178,
      c: "本期请到 08 届的学姐分享：三甲医院住院医师的一天——7 点查房、午间雾里抢时间写病历、晚上 9 点下班是常态。\n\n「医学不浪漫，但值得。」完整版访谈整理中，想问的问题在评论区留，下期统一回复。",
      r: [
        { u: "liu2026", c: "医生学长（姐）辛苦了", h: 2 },
        { u: "su2027", c: "什么时候做一期程序员专场呀", h: 5 },
      ],
    },
    {
      b: "alumni", u: "zhang2025", t: "各地校友会中秋聚会照片汇总（广州 / 北京 / 上海）", d: 13, m: 760, views: 156,
      c: "今年中秋三地校友会都有聚会，照片已汇总：广州场 40+ 人、北京场 25 人、上海场 18 人。\n\n明年中秋，希望你也在场。",
      r: [
        { u: "su2027", c: "北京场的烟花好美", h: 4 },
        { u: "chen2026", c: "标记一下，五年后见", h: 9 },
      ],
    },
  ];

  const insThread = db.prepare(
    `INSERT INTO threads (board_id, author_id, title, content, views, is_pinned, is_featured, created_at, last_reply_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insReply = db.prepare(
    `INSERT INTO replies (thread_id, author_id, content, created_at) VALUES (?, ?, ?, ?)`
  );
  const updThread = db.prepare(
    `UPDATE threads SET reply_count = ?, last_reply_at = ? WHERE id = ?`
  );

  const threadIds: Record<string, number> = {};
  threads.forEach((s, i) => {
    const created = ts(s.d, s.m ?? 600);
    const info = insThread.run(
      bid[s.b], uid[s.u], s.t, s.c,
      s.views ?? 80 + ((i * 37) % 160),
      s.pin ? 1 : 0, s.feat ? 1 : 0,
      created, created
    );
    const tid = Number(info.lastInsertRowid);
    threadIds[s.t] = tid;
    let last = created;
    for (const r of s.r ?? []) {
      const at = after(created, r.h ?? 2);
      insReply.run(tid, uid[r.u], r.c, at);
      if (at > last) last = at;
    }
    updThread.run((s.r ?? []).length, last, tid);
  });

  /* 水楼 + 等级灌水回复（让各用户达到目标等级） */
  const waterCreated = ts(14, 720);
  const waterInfo = insThread.run(
    bid["chat"], uid["su2027"],
    "【水楼】华附人今天也在好好生活，进来聊五毛钱的",
    "楼下规则：想说啥说啥——打卡、吐槽、今日碎片都行，保持友善。\n\n我先来：今天操场的晚霞是粉色的，拍了 32 张。",
    520, 0, 0, waterCreated, waterCreated
  );
  const waterId = Number(waterInfo.lastInsertRowid);
  threadIds["water"] = waterId;

  const targets: Record<string, number> = {
    zhang2025: 102, su2027: 55, chen2026: 26, liu2026: 22, lin2027: 21, wang2028: 12,
  };
  const waterMsgs = [
    "每日打卡，顺便想念食堂", "今天也想吃烧腊饭", "晚自习的大家加油", "路过顶一帖",
    "水一点经验值，莫怪", "周测顺利！", "操场今天风好大", "糖醋排骨yyds",
    "课间来水一发", "毕业多年的路人飘过", "今天夕阳绝美，大家都看到了吗", "冲冲冲！",
    "早八人表示辛苦了", "打完球来水一贴，舒坦", "考试周保佑保佑", "给楼里所有人递上一杯热奶茶",
  ];
  const cur = db
    .prepare(
      `SELECT u.id, u.username,
        (SELECT COUNT(*) FROM threads WHERE author_id = u.id) +
        (SELECT COUNT(*) FROM replies WHERE author_id = u.id) AS n
       FROM users u WHERE u.role != 'admin'`
    )
    .all() as Array<{ id: number; username: string; n: number }>;
  const need: Array<{ id: number; username: string; add: number }> = [];
  for (const row of cur) {
    const t = targets[row.username];
    if (t && t > row.n) need.push({ id: row.id, username: row.username, add: t - row.n });
  }
  const totalNeed = need.reduce((s, x) => s + x.add, 0);
  const spread = 14 * 24 * 60; // 分钟跨度
  let idx = 0;
  const insWater = db.transaction(() => {
    for (const { id, add } of need) {
      for (let k = 0; k < add; k++) {
        const minutesAgo = spread - ((idx + 1) * spread) / (totalNeed + 1);
        const t = new Date(NOW - minutesAgo * 60000);
        insReply.run(waterId, id, waterMsgs[idx % waterMsgs.length], fmtDate(t));
        idx++;
      }
    }
  });
  insWater();
  const lastWater = (db
    .prepare("SELECT created_at FROM replies WHERE thread_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(waterId) as { created_at: string }).created_at;
  const waterCount = (db.prepare("SELECT COUNT(*) AS c FROM replies WHERE thread_id = ?").get(waterId) as { c: number }).c;
  updThread.run(waterCount, lastWater, waterId);

  /* 点赞与收藏 */
  const insLike = db.prepare("INSERT OR IGNORE INTO thread_likes (user_id, thread_id) VALUES (?, ?)");
  const like = (t: string, us: string[]) => us.forEach((u) => insLike.run(uid[u], threadIds[t]));
  like("从华附到北大数院：给准备强基的学弟学妹 10 条建议", ["chen2026", "lin2027", "wang2028", "su2027", "liu2026"]);
  like("毕业五年，最怀念的还是校运会那场 4×100 接力", ["su2027", "chen2026", "wang2028", "liu2026", "lin2027"]);
  like("九月社团招新全攻略：47 个社团一帖看懂", ["wang2028", "chen2026", "liu2026"]);
  like("2026 强基计划时间线整理（报名 / 初审 / 校测）", ["lin2027", "su2027", "wang2028"]);
  like("食堂二楼新出的滑蛋饭，本周必吃清单第一名", ["wang2028", "su2027", "lin2027"]);
  like("HSFZ BBS 社区公约（发帖前必读）", ["zhang2025", "wang2028", "su2027"]);
  like("英语读后续写 18 → 22 分经验（附句型积累法）", ["chen2026", "liu2026", "su2027"]);

  const insFav = db.prepare("INSERT OR IGNORE INTO thread_favorites (user_id, thread_id) VALUES (?, ?)");
  insFav.run(uid["chen2026"], threadIds["2026 强基计划时间线整理（报名 / 初审 / 校测）"]);
  insFav.run(uid["chen2026"], threadIds["从华附到北大数院：给准备强基的学弟学妹 10 条建议"]);
  insFav.run(uid["su2027"], threadIds["九月社团招新全攻略：47 个社团一帖看懂"]);
  insFav.run(uid["wang2028"], threadIds["分享：自己整理的高中化学常用方程式汇总"]);
  insFav.run(uid["wang2028"], threadIds["食堂二楼新出的滑蛋饭，本周必吃清单第一名"]);
  insFav.run(uid["liu2026"], threadIds["毕业五年，最怀念的还是校运会那场 4×100 接力"]);

  /* 示例工单（已回复状态，演示对话效果） */
  const insTicket = db.prepare(
    `INSERT INTO tickets (user_id, category, subject, status, user_read_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insTMsg = db.prepare(
    `INSERT INTO ticket_messages (ticket_id, sender_id, is_admin, content, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const t1 = insTicket.run(uid["lin2027"], "suggestion", "建议增加「课程表」快捷查询入口", "replied", after(ts(2, 800), 24), ts(2, 800), after(ts(2, 800), 24));
  insTMsg.run(Number(t1.lastInsertRowid), uid["lin2027"], 0, "管理员好！很多同学来找课程表都要翻教务群，建议在首页加个快捷入口，感谢！", ts(2, 800));
  insTMsg.run(Number(t1.lastInsertRowid), uid["admin"], 1, "感谢建议！已列入开发计划，预计下个版本上线，届时会在站务公告通知大家。", after(ts(2, 800), 24));
  const t2 = insTicket.run(uid["wang2028"], "title_request", "头衔申请：篮球社新人王", "open", "", ts(1, 780), ts(1, 780));
  insTMsg.run(Number(t2.lastInsertRowid), uid["wang2028"], 0, "管理员好！我是高一的阿旺，刚加入篮球社，想申请一个「篮球社新人王」头衔，给社团招新撑撑场面~", ts(1, 780));
}

seed();
ensureSportsBoards();
ensureGradeBoards();
ensureConfessionBoard();

/* 后补板块迁移：表白墙（支持匿名） */
function ensureConfessionBoard() {
  if (db.prepare("SELECT id FROM boards WHERE slug = ?").get("confession")) return;
  db.prepare(
    `INSERT INTO boards (slug, name, description, icon, category, sort)
     VALUES ('confession', '表白墙', '大胆说出你的心意，支持匿名发表', '💌', '情感联结', 85)`
  ).run();
}

export type UserRow = {
  id: number; username: string; password_hash: string; nickname: string; bio: string; avatar: string;
  role: string; status: string; reject_reason: string; banned: number;
  custom_title: string; grade: string; phone: string; email: string; created_at: string;
};

export const GRADES = ["初一", "初二", "初三", "高一", "高二", "高三", "已毕业", "其他"];

export function getSetting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function userPostCount(userId: number): number {
  return (db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM threads WHERE author_id = ?) + (SELECT COUNT(*) FROM replies WHERE author_id = ?) AS n`
    )
    .get(userId, userId) as { n: number }).n;
}
