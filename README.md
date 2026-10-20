# HSFZ BBS · 华附校园论坛

✨一个属于华附人自己的网上家园：学习、年级、球友、生活、交易，一个都不少。

**在线访问：[https://bbs.hsfz-bbs.cn](https://bbs.hsfz-bbs.cn)**

## 🌟功能介绍

### 七大分区 · 23 个板块

| 分区 | 板块 |
| --- | --- |
| 学习成长 | 学习互助 · 考试交流 · 文学创作 · 竞赛升学 |
| 年级群 | 初一专区 · 初二专区 · 初三专区 · 高一专区 · 高二专区 · 高三专区 |
| 球友 | 篮球 · 足球 · 板球 · 羽毛球 · 乒乓球 · 排球 · 网球 · 匹克球 |
| 生活娱乐 | 美食推荐 · 社团活动 · 校园闲聊 |
| 交易互助 | 跳蚤市场 · 失物招领 |
| 游戏 | 游戏讨论 |
| 情感联结 | 表白墙 · 校园回忆 · 校友交流 |
| 官方 | 站务公告 |

其中「年级群」只有本年级的同学可以发言，像年级群一样，但不会被打扰。「表白墙」支持匿名发表，大胆说出你的心意（管理员可见作者以维护秩序）。

### 🌟发帖带图

发帖时最多添加 4 张照片，自动压缩，图文并茂地记录校园生活。表白墙发帖还可以选择匿名。

### 🌟头衔系统

发帖回帖自动升级：新入校 → 校园新人 → 活跃同学 → 校园达人 → 传奇学长。表现优秀的同学还会被授予金色专属头衔（比如"板球队长""食堂鉴定师"）。

### 🌟帖子互动

回复、点赞、收藏一个不少，还有全站搜索和首页热门话题榜。被回复、被引用、被 @、被点赞时，「我的消息」会出现红点提醒，点进通知可直接跳到对应楼层。私信功能支持与同学一对一交流。

### 自定义头像与深浅主题

上传自己喜欢的头像（不设置也有字母头像），白天浅色、晚上深色，一键切换。

### 🌟联系管理员

在「我的消息」里发工单：申请头衔、提改进建议、举报内容，管理员会逐条回复。

## 🌟参与共建

这是一个由学生发起的开源项目，欢迎每一位同学参与建设，方式不限：

- **有点子**：新板块、新功能的想法，直接在论坛「我的消息」里发工单，或到仓库提 [Issue](../../issues)；
- **发现 bug**：页面报错、显示不对，提 [Issue](../../issues) 告诉我们就好；
- **会（或想学）写代码**：Fork 本仓库，改动后提交 PR，修一个错别字也算贡献。前端（React / Tailwind）、后端（Next.js / SQLite）、界面设计、文档文案，都需要人手；
- **不会代码也没关系**：写使用教程、帮忙测试找 bug，同样是宝贵的贡献。

每一个 Issue 和 PR 都会被认真对待。

---

本项目基于 [MIT License](LICENSE) 开源。

## Experimental recommendations

Signed-in users can opt into recommendations from **实验功能** in the account menu. BGE-small-zh-v1.5 uses 512-dimensional normalized embeddings and a 19.21 MB local quantized model. Encoding, personal profiles and ranking run in the browser because deployment server specifications are unknown and to reduce server load; server work stays in SQLite. All inference scripts, tokenizer, model and WASM are served from the application origin. See [recommendation operations](docs/recommendations.md) for the refresh worker and deployment limits.
