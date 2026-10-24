import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "../components/RichText";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { markdownMentionNames } from "../lib/markdown-mentions";

const render = (content: string, usernames: string[] = []) =>
  renderToStaticMarkup(createElement(RichText, { content, usernames }));

test("shared Markdown rendering preserves GFM, math and headings without enabling raw HTML", () => {
  const html = render("# Topic\n\n**bold** and $x^2$\n\n$$\n\\sum_{i=1}^{n} i\n$$\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))");
  assert.match(html, /<h1>Topic<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
  assert.match(html, /<table>/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
});

test("mentions become links only in prose, preserving code, math, links and email addresses", () => {
  const source = [
    "Hello @student_test and **@student_test**; @unknown_user stays plain.",
    "`@student_test`",
    "```\n@student_test\n```",
    "$@student_test$",
    "$$\n@student_test\n$$",
    "[@student_test](https://example.com/@student_test)",
    "[@student_test][reference]\n\n[reference]: https://example.org/@student_test",
    "![avatar @student_test](https://example.org/avatar.png)",
    "https://example.org/@student_test and student@student_test.example",
  ].join("\n\n");
  const html = render(source, ["student_test"]);
  assert.equal((html.match(/href="\/u\/student_test"/g) ?? []).length, 2);
  assert.match(html, /<code>@student_test<\/code>/);
  assert.match(html, /href="https:\/\/example.com\/@student_test"/);
  assert.doesNotMatch(html, /href="\/u\/unknown_user"/);
  assert.deepEqual(markdownMentionNames(source), ["student_test", "unknown_user"]);
});

test("mention extraction ignores code and links and bounds distinct candidates", () => {
  const source = "`@code_user`\n\n[link @link_user](https://example.com/@path_user)\n\n$@math_user$\n\nuser@email_user.example\n\n" +
    Array.from({ length: 25 }, (_, index) => `@student_${index}`).join(" ") + " @student_0";
  assert.deepEqual(markdownMentionNames(source, 20), Array.from({ length: 20 }, (_, index) => `student_${index}`));
  assert.deepEqual(markdownMentionNames(source, 0), []);
  assert.deepEqual(markdownMentionNames("@abcdefghijklmnopqrstu @valid_userX @valid_user"), ["valid_user"]);
});

test("KaTeX remains untrusted and cannot create executable links", () => {
  const html = render("$\\href{javascript:alert(1)}{click}$\n\n$\\htmlClass{unsafe}{text}$");
  assert.doesNotMatch(html, /href="javascript:|class="unsafe"/);
});

test("editor preview and published content use the same renderer", () => {
  const content = "**Same source**\nnext line\n\n$x^2$\n\n- first\n- second";
  const preview = renderToStaticMarkup(createElement(MarkdownPreview, { content, className: "test-preview" }));
  const published = renderToStaticMarkup(createElement(RichText, { content, className: "test-preview" }));
  assert.equal(preview, published);
  assert.match(renderToStaticMarkup(createElement(MarkdownPreview, { content: "" })), /暂无内容/);
});

test("short codes render as standalone emoji spans with canonical metadata", async () => {
  const { emojiByCode, codeOf } = await import("../lib/emoji-catalog");
  const html = render(":smile: and :+1::skin-tone-4: and :thumbsup: and :not_a_real_code:");
  // 三种 code（含别名）各渲染一个独立 span，元数据用规范 short code
  assert.equal((html.match(/<span class="native-emoji"/g) ?? []).length, 3);
  assert.match(html, /data-emoji-code=":smile:"[^>]*>😄<\/span>/);
  assert.match(html, /data-emoji-code=":\+1::skin-tone-4:"[^>]*>👍🏽<\/span>/);
  assert.match(html, /data-emoji-code=":\+1:"[^>]*>👍<\/span>/);
  assert.match(html, /title=":smile:"/);
  // 未识别 code 保持原文
  assert.match(html, /:not_a_real_code:/);
  // 手打的裸 Unicode 不包装
  assert.doesNotMatch(render("😄 plain"), /native-emoji/);
  // 代码与行内代码内不替换
  assert.doesNotMatch(render("`:smile:`\n\n```\n:smile:\n```"), /native-emoji/);
  // 目录：别名归一、肤色变体、unicode 反查取规范 id
  assert.equal(emojiByCode.get(":thumbsup:")?.code, ":+1:");
  assert.equal(emojiByCode.get(":smile:")?.native, "😄");
  assert.equal(codeOf("👍"), ":+1:");
  assert.equal(codeOf("👍🏽"), ":+1::skin-tone-4:");
  assert.equal(codeOf("😄"), ":smile:");
  assert.equal(codeOf("nope"), "");
});

test("upload-pending tokens render as a status chip instead of an empty-src img", () => {
  const html = render("before ![上传中](upload-pending:abc-123) after");
  assert.doesNotMatch(html, /<img[^>]*src=""/);
  assert.match(html, /class="upload-pending"/);
  assert.match(html, /上传中/);
  assert.match(html, /before /);
  assert.match(html, / after/);
});

test("spoiler blocks trim padding newlines so no blank lines wrap the content", () => {
  const html = render("前文\n\n[spoiler]\n剧透内容\n[/spoiler]\n\n后文");
  assert.match(html, /<span class="spoiler"[^>]*>剧透内容<\/span>/);
  assert.doesNotMatch(html, /<span class="spoiler"[^>]*><br>/);
  // 内容内部的手动换行仍然保留
  const multiline = render("[spoiler]第一行\n第二行[/spoiler]");
  assert.match(multiline, /第一行<br\/>\s*第二行/);
});

test("emoji-only paragraphs are marked for jumbo rendering", () => {
  const marked = (content: string) => render(content).includes('class="emoji-only"');
  assert.ok(marked("前文\n\n:smile:\n\n后文"));
  assert.ok(marked("😄"));
  assert.ok(marked(":smile: :thumbsup:"));
  assert.ok(marked("😄 :smile:"));
  assert.ok(!marked("😄 文字"));
  assert.ok(!marked(":smile: :grinning: :smile: :grinning:"));
  assert.ok(!marked("`😄`"));
});

test("custom emojis keep precedence and carry metadata", () => {
  const html = renderToStaticMarkup(
    createElement(RichText, {
      content: ":huafu: 自定义表情",
      emojis: [{ name: "huafu", image_path: "/uploads/huafu.png" }],
    }),
  );
  assert.match(html, /<img[^>]*class="custom-emoji"[^>]*data-emoji-code=":huafu:"[^>]*>/);
  assert.match(html, /<img[^>]*title=":huafu:"[^>]*>/);
});
