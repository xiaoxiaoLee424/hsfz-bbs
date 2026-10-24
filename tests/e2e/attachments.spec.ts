import { test, expect, type BrowserContext, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { markdownDocument, htmlDocument, pdfDocument } from "../fixtures/documents";

const authenticate = (context: BrowserContext, id = 5) => context.addCookies([
  { name: "hsfz_session", value: String(id).repeat(64), url: "http://127.0.0.1:3211" },
]);
const row = (container: Locator, name: string) => container.locator("li").filter({ has: container.page().getByText(name, { exact: true }) }).last();
const files = [
  { name: "练习.pdf", mimeType: "application/pdf", buffer: pdfDocument() },
  { name: "笔记.md", mimeType: "text/markdown", buffer: markdownDocument },
  { name: "页面.html", mimeType: "text/html", buffer: htmlDocument },
];
const genericFiles = [
  { name: "讨论.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("WORD_ATTACHMENT_SENTINEL") },
  { name: "分享.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer: Buffer.from("POWERPOINT_ATTACHMENT_SENTINEL") },
  { name: "数据.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 1, 2, 255, 128]) },
];

test("all attachments download original bytes and non-PDF files cannot open inline", async ({ page, context, request }) => {
  await authenticate(context);
  const outbound: string[] = [];
  page.on("request", (request) => { if (request.url().includes("invalid.example")) outbound.push(request.url()); });
  await page.goto("/t/10");
  for (const file of files) {
    const attachment = row(page.locator("article"), file.name);
    const href = await attachment.getByRole("link", { name: "下载", exact: true }).getAttribute("href");
    expect(href).toMatch(/^\/attachments\/[a-f0-9]{32}$/);
    const response = await context.request.get(href!);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(file.buffer);
    expect(response.headers()["content-disposition"]).toContain("attachment;");
    expect(response.headers()["content-disposition"]).toContain(encodeURIComponent(file.name));
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-cache");
    expect(response.headers()["cache-control"]).not.toContain("public");
    const etag = response.headers()["etag"];
    expect(etag).toBeTruthy();
    const cached = await context.request.get(href!, { headers: { "If-None-Match": etag } });
    expect(cached.status()).toBe(304);
    expect(await cached.body()).toHaveLength(0);
    // A previously obtained validator cannot bypass the document's access checks.
    const denied = await request.get(href!, { headers: { "If-None-Match": etag } });
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain("PREVIEW");
    if (!file.name.endsWith(".pdf")) {
      await expect(attachment.getByRole("button", { name: "预览", exact: true })).toHaveCount(0);
      const forcedPreview = await context.request.get(`${href}?preview=1`);
      expect(forcedPreview.headers()["content-type"]).toContain("application/octet-stream");
      expect(forcedPreview.headers()["content-disposition"]).toContain("attachment;");
      expect(await forcedPreview.body()).toEqual(file.buffer);
    }
  }
  await expect(page.locator("article iframe")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "MD_PREVIEW_SENTINEL" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "HTML_SAFE_PREVIEW" })).toHaveCount(0);
  const html = row(page.locator("article"), "页面.html");
  expect(await page.locator("body").getAttribute("data-document-pwn")).toBeNull();
  expect(outbound).toEqual([]);
  const downloadPromise = page.waitForEvent("download");
  await html.getByRole("link", { name: "下载", exact: true }).click();
  const downloaded = await downloadPromise;
  expect(downloaded.suggestedFilename()).toBe("页面.html");
  expect(await readFile((await downloaded.path())!)).toEqual(htmlDocument);
});

test("PDF pages render without a browser plugin and can turn pages", async ({ page, context }) => {
  await authenticate(context);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => { if (/Content Security Policy|Refused to/.test(message.text())) failures.push(message.text()); });
  await page.goto("/t/10");
  const pdf = row(page.locator("article"), "练习.pdf");
  await pdf.getByRole("button", { name: "预览", exact: true }).click();
  await expect(pdf.locator("canvas")).toHaveAttribute("data-rendered", "true", { timeout: 20_000 });
  const nonBlank = await pdf.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < data.length; index += 4) if (data[index] < 200 && data[index + 3] > 0) return true;
    return false;
  });
  expect(nonBlank).toBe(true);
  await expect(pdf.getByText("1 / 2", { exact: true })).toBeVisible();
  await pdf.getByRole("button", { name: "下一页" }).click();
  await expect(pdf.getByText("2 / 2", { exact: true })).toBeVisible();
  await expect(pdf.locator("canvas")).toHaveAttribute("aria-label", "练习.pdf，第 2 页");
  await expect(pdf.locator("canvas")).toHaveAttribute("data-rendered", "true");
  expect(failures).toEqual([]);
});

test("announcement post attachments are public while reply attachments stay private", async ({ page, context, request }) => {
  await page.goto("/t/1");
  const visible = row(page.locator("article"), "公告.md");
  const publicHref = await visible.getByRole("link", { name: "下载", exact: true }).getAttribute("href");
  expect((await request.get(publicHref!)).status()).toBe(200);
  expect(await page.content()).not.toContain("回复附件.md");
  await authenticate(context);
  await page.reload();
  const privateHref = await page.locator("li").filter({ has: page.getByText("回复附件.md", { exact: true }) }).last()
    .getByRole("link", { name: "下载", exact: true }).getAttribute("href");
  expect((await request.get(privateHref!)).status()).toBe(404);
  expect(await (await context.request.get(privateHref!)).text()).toContain("PRIVATE_ANNOUNCEMENT_REPLY_ATTACHMENT");
});

test("all post images offer a real download response", async ({ page, context }) => {
  await authenticate(context);
  await page.goto("/t/10");
  const image = page.getByRole("link", { name: "下载帖子图片 1" });
  const href = await image.getAttribute("href");
  expect(href).toBe("/uploads/e2e-document-image.png?download=1");
  const response = await context.request.get(href!);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(response.headers()["content-disposition"]).toContain("attachment;");
  const waitForDownload = page.waitForEvent("download");
  await image.click();
  expect((await waitForDownload).suggestedFilename()).toBe("e2e-document-image.png");
});

test("a failed post retains chosen files and arbitrary attachments upload together", async ({ page, context }) => {
  await authenticate(context, 6);
  await page.goto("/new?board=study");
  await page.locator('[name="title"]').fill("attachment upload regression");
  await page.locator('textarea[name="content"]').fill("赌博不允许发帖");
  await expect(page.getByLabel("选择文件", { exact: true })).not.toHaveAttribute("accept");
  await page.getByLabel("选择文件", { exact: true }).setInputFiles(genericFiles);
  await page.getByRole("button", { name: "🚀 发布帖子" }).click();
  await expect(page.getByText(/内容包含敏感词/)).toBeVisible();
  expect(await page.locator('input[name="attachments"]').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(3);
  await page.locator('textarea[name="content"]').fill("all three attachments submitted together");
  await page.getByRole("button", { name: "🚀 发布帖子" }).click();
  await expect(page).toHaveURL(/\/t\/\d+$/);
  for (const file of genericFiles) {
    const attachment = row(page.locator("article"), file.name);
    await expect(attachment.getByText(file.name, { exact: true })).toBeVisible();
    await expect(attachment.getByRole("button", { name: "预览", exact: true })).toHaveCount(0);
    const href = await attachment.getByRole("link", { name: "下载", exact: true }).getAttribute("href");
    const response = await context.request.get(href!);
    expect(response.headers()["content-type"]).toContain("application/octet-stream");
    expect(await response.body()).toEqual(file.buffer);
    if (file.name.endsWith(".bin")) {
      const partial = await context.request.get(href!, { headers: { Range: "bytes=1-3", "Accept-Encoding": "identity" } });
      expect(partial.status()).toBe(206);
      expect(partial.headers()["content-range"]).toBe(`bytes 1-3/${file.buffer.length}`);
      expect(await partial.body()).toEqual(file.buffer.subarray(1, 4));
      const invalid = await context.request.get(href!, { headers: { Range: `bytes=${file.buffer.length}-`, "Accept-Encoding": "identity" } });
      expect(invalid.status()).toBe(416);
      expect(invalid.headers()["content-range"]).toBe(`bytes */${file.buffer.length}`);
      const head = await context.request.head(href!, { headers: { "Accept-Encoding": "identity" } });
      expect(head.status()).toBe(200);
      expect(head.headers()["content-length"]).toBe(String(file.buffer.length));
      expect(await head.body()).toHaveLength(0);
    }
  }
  await expect(page.getByText(/这里可以|现已支持|支持 PDF/)).toHaveCount(0);
});

test("reply attachments clear after success and are downloadable", async ({ page, context }) => {
  await authenticate(context, 7);
  await page.goto("/t/13");
  const form = page.locator("#reply-form");
  await form.locator('textarea[name="content"]').fill("reply document upload");
  await form.getByLabel("选择文件", { exact: true }).setInputFiles([files[0]]);
  await form.getByRole("button", { name: "↩︎ 回复" }).click();
  await expect(form.locator('textarea[name="content"]')).toHaveValue("");
  await expect(form.getByText("练习.pdf", { exact: true })).toHaveCount(0);
  const replyFile = page.locator("article").getByText("练习.pdf", { exact: true });
  await expect(replyFile).toBeVisible();
  const href = await replyFile.locator("xpath=ancestor::li[1]").getByRole("link", { name: "下载", exact: true }).getAttribute("href");
  expect(await (await context.request.get(href!)).body()).toEqual(pdfDocument());
  await expect(replyFile.locator("xpath=ancestor::li[1]").getByRole("button", { name: "预览", exact: true })).toBeVisible();
});

test("deleting a post removes its links without breaking shared document bytes", async ({ page, context }) => {
  await authenticate(context, 4);
  await page.goto("/t/12");
  const link = await page.locator("article").getByRole("link", { name: "下载", exact: true }).getAttribute("href");
  await page.locator("#post-0 .post-more summary").click();
  await page.locator("#post-0").getByRole("button", { name: "删除帖子", exact: true }).click();
  await page.locator("#post-0").getByRole("button", { name: "确认执行？", exact: true }).click();
  await expect(page).toHaveURL(/\/b\/study$/);
  expect((await context.request.get(link!)).status()).toBe(404);
  await page.goto("/t/10");
  const shared = await row(page.locator("article"), "练习.pdf").getByRole("link", { name: "下载", exact: true }).getAttribute("href");
  expect(await (await context.request.get(shared!)).body()).toEqual(pdfDocument());
});
