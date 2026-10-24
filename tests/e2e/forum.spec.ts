import { test, expect, type BrowserContext } from "@playwright/test";

const authenticate = (context: BrowserContext, id = 2) => context.addCookies([
  { name: "hsfz_session", value: String(id).repeat(64), url: "http://127.0.0.1:3211" },
]);

test("guest HTML and RSC expose announcements without member content or metadata", async ({ page, request }) => {
  const home = await request.get("/");
  const html = await home.text();
  expect(html).not.toContain("PRIVATE_THREAD");
  expect(html).not.toContain("注册同学</dt>");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["x-frame-options"]).toBe("DENY");
  expect(home.headers()["x-powered-by"]).toBeUndefined();
  const csp = home.headers()["content-security-policy"];
  expect(csp).toContain("'nonce-");
  expect(csp).not.toContain("'unsafe-eval'");
  const rsc = await request.get("/t/1", { headers: { RSC: "1" } });
  expect(await rsc.text()).not.toContain("PRIVATE_REPLY_SENTINEL");
  await page.goto("/t/1");
  await expect(page.getByText("PUBLIC_NOTICE_BODY")).toBeVisible();
  await expect(page.getByText("PRIVATE_REPLY_SENTINEL")).toHaveCount(0);
  for (const url of ["/t/2", "/u/test_member"]) {
    const response = await request.get(url);
    expect(await response.text()).not.toMatch(/PRIVATE_THREAD_TITLE|PRIVATE_2|PRIVATE_THREAD_BODY/);
    await page.goto(url);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("real login, hydration and theme toggle work under production CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => { if (/Content Security Policy|hydration/i.test(message.text())) violations.push(message.text()); });
  await page.goto("/login");
  await page.locator('[name="username"][required]').fill("test_member");
  await page.locator('[name="password"]').fill("LocalTestPass-123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("PRIVATE_THREAD_TITLE", { exact: true }).first()).toBeVisible();
  const before = await page.locator("html").getAttribute("class");
  await page.getByRole("button", { name: "选择主题" }).click();
  await page.getByRole("button", { name: /深色/ }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).not.toBe(before);
  expect(violations).toEqual([]);
});

test("toolbar and emoji update controlled editor state and preview", async ({ page, context }) => {
  await authenticate(context);
  await page.goto("/new?board=study");
  const editor = page.locator('textarea[name="content"]');
  await editor.fill("hello");
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 5));
  await page.getByRole("button", { name: "加粗" }).click();
  await expect(editor).toHaveValue("**hello**");
  await editor.fill("");
  await page.getByRole("button", { name: "插入引用块" }).click();
  await expect(editor).toHaveValue(/\[quote\]\n引用内容\n\[\/quote\]/);
  await page.getByRole("button", { name: "添加表情" }).click();
  await page.getByRole("button", { name: "😀", exact: true }).click();
  await expect(editor).toHaveValue(/:grinning:/);
  await expect(page.locator(".composer-preview .markdown-body")).toContainText("😀");
  await editor.press("End");
  await editor.press("a");
  await expect(page.locator(".composer-preview .markdown-body")).toContainText("a");
  await editor.fill("$x^2$ and $\\frac{1}{2}$");
  await expect(page.locator(".composer-preview .katex")).toHaveCount(2);
  await page.getByRole("button", { name: "隐藏预览" }).click();
  await expect(page.locator(".composer-preview")).toBeHidden();
  await page.getByRole("button", { name: "显示预览" }).click();
  await expect(page.locator(".composer-preview")).toBeVisible();
  await page.getByRole("button", { name: "插入图片" }).click();
  await expect(page.locator('input[type="file"][multiple]').first()).toBeAttached();
  await page.getByRole("button", { name: "添加附件" }).click();
  await expect(page.locator('input[aria-label="选择文件"]').first()).toBeAttached();
});

test("forged grade changes fail and reviewed grade stays unchanged", async ({ page, context }) => {
  await authenticate(context);
  await page.goto("/settings");
  await page.locator('input[name="grade"]').evaluate((element: HTMLInputElement) => { element.value = "高三"; });
  await page.getByRole("button", { name: "保存资料" }).click();
  await expect(page.getByText("年级变更请通过工单联系管理员核实")).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="grade"]')).toHaveValue("高一");
});

test("matching a roster entry still requires manual approval", async ({ page }) => {
  await page.goto("/register");
  await page.locator('[name="username"][required]').fill("roster_test");
  await page.locator('[name="real_name"]').fill("测试同学");
  await page.locator('[name="student_id"]').fill("TEST-001");
  await page.locator('[name="grade"]').selectOption("高一");
  await page.locator('[name="phone"]').fill("13800000000");
  await page.locator('[name="password"]').fill("LocalTestPass-123");
  await page.locator('[name="password2"]').fill("LocalTestPass-123");
  await page.getByRole("button", { name: "提交注册申请" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await page.locator('[name="username"][required]').fill("roster_test");
  await page.locator('[name="password"]').fill("LocalTestPass-123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("账号正在审核中，请等待管理员批准后再登录")).toBeVisible();
});

test("successful reply clears editor and does not repeat the previous reply", async ({ page, context }) => {
  await authenticate(context, 3);
  await page.goto("/t/2");
  const editor = page.locator('textarea[name="content"]');
  await editor.fill("local reply regression sentinel");
  await page.getByRole("button", { name: "↩︎ 回复" }).click();
  await expect(editor).toHaveValue("");
  await expect(page.locator(".markdown-body").filter({ hasText: "local reply regression sentinel" })).toHaveCount(1);
});

test("admin can review identity, correct grade and approve a pending account", async ({ page, context }) => {
  await authenticate(context, 1);
  const response = await page.goto("/admin");
  expect(await response!.text()).not.toMatch(/\$2[aby]\$10\$/);
  const applicant = page.locator("li").filter({ hasText: "@roster_test" });
  await expect(applicant).toContainText("测试同学");
  await expect(applicant).toContainText("TEST-001");
  await expect(applicant).toContainText("138****0000");
  await applicant.locator('select[name="grade"]').selectOption("高二");
  await applicant.getByRole("button", { name: "确认年级" }).click();
  await applicant.getByRole("button", { name: "✓ 批准" }).click();
  await expect(page.getByText("暂无待审核的注册申请")).toBeVisible();
  await context.clearCookies();
  await page.goto("/login");
  await page.locator('[name="username"][required]').fill("roster_test");
  await page.locator('[name="password"]').fill("LocalTestPass-123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.goto("/settings");
  await expect(page.locator('input[name="grade"]')).toHaveValue("高二");
});
