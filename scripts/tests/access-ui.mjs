// Browser contract regression: Auth/RPC responses are explicit test fixtures.
// This does not claim to verify cloud Auth, SMTP, or production configuration.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const preview = process.env.HP_PREVIEW_URL || "http://127.0.0.1:5174";
const env = loadEnv("supabase", process.cwd(), "VITE_");
const origin = new URL(env.VITE_SUPABASE_URL).origin;
const authId = "10000000-0000-4000-8000-000000000010";
const actorId = "20000000-0000-4000-8000-000000000010";
const oldPassword = "oldpw123";
const newPassword = "a much longer new password";
const user = {
  id: authId,
  aud: "authenticated",
  role: "authenticated",
  email: "account_test@gm.local",
  is_anonymous: false,
  user_metadata: {},
  app_metadata: { provider: "email", providers: ["email"] },
  created_at: new Date().toISOString(),
};
const claims = Buffer.from(
  JSON.stringify({
    sub: authId,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),
).toString("base64url");
const session = {
  access_token: `e30.${claims}.test`,
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const screenshots = join(tmpdir(), "hp-account-audit");
await mkdir(screenshots, { recursive: true });
let checks = 0;
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    let nickname = "账号测试";
    let disabled = false;
    const calls = [];
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.postDataJSON();
      calls.push({
        path: url.pathname,
        method: request.method(),
        search: url.search,
        body,
      });
      let result = [];
      let status = 200;
      if (url.pathname.endsWith("/get_service_status")) result = "ready";
      else if (url.pathname.endsWith("/ensure_actor")) {
        if (disabled) {
          status = 400;
          result = { message: "ACCOUNT_DISABLED" };
        } else
          result = { id: actorId, display_name: nickname, disabled: false };
      } else if (url.pathname.endsWith("/get_gm_access")) result = null;
      else if (url.pathname.endsWith("/update_account_profile")) {
        assert.deepEqual(Object.keys(body), ["p_display_name"]);
        nickname = body.p_display_name;
        result = { id: actorId, display_name: nickname, disabled: false };
      } else if (url.pathname === "/auth/v1/token") {
        if (body.password !== oldPassword && body.password !== newPassword) {
          status = 400;
          result = {
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          };
        } else result = session;
      } else if (url.pathname === "/auth/v1/user") result = user;
      else if (url.pathname === "/auth/v1/signup") result = session;
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page.goto(preview);
    await page.getByRole("tab", { name: "注册", exact: true }).click();
    await page.getByLabel("账号名", { exact: false }).fill("account_test");
    await page.getByLabel("昵称", { exact: true }).fill("新昵称");
    await page.getByLabel("密码", { exact: true }).fill(newPassword);
    await page
      .getByLabel("确认密码", { exact: true })
      .fill("mismatching password");
    await page.getByRole("button", { name: "注册账号", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "两次输入" }).waitFor();
    assert.equal(
      calls.some((c) => c.path.endsWith("/signup")),
      false,
    );
    checks++;
    await page.getByRole("button", { name: "显示密码", exact: true }).click();
    assert.equal(
      await page.getByLabel("密码", { exact: true }).getAttribute("type"),
      "text",
    );
    checks++;
    // Legacy passwords still work after raising the minimum for new passwords.
    await page.getByRole("tab", { name: "登录", exact: true }).click();
    await page.getByLabel("密码", { exact: true }).fill(oldPassword);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.getByRole("button", { name: "账号设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "账号设置", exact: true });
    await dialog.getByLabel("账号昵称").fill("新账号昵称");
    await dialog.getByRole("button", { name: "保存昵称" }).click();
    await dialog
      .getByRole("status")
      .filter({ hasText: "昵称已更新" })
      .waitFor();
    assert.equal(nickname, "新账号昵称");
    checks++;
    await dialog
      .getByLabel("当前密码", { exact: true })
      .fill("wrong current password");
    await dialog.getByLabel("新密码", { exact: true }).fill(newPassword);
    await dialog.getByLabel("确认新密码", { exact: true }).fill(newPassword);
    await dialog.getByRole("button", { name: "更新密码" }).click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "当前密码不正确" })
      .waitFor();
    assert.equal(
      calls.some((c) => c.path === "/auth/v1/user" && c.method === "PUT"),
      false,
    );
    checks++;
    await dialog.getByLabel("当前密码", { exact: true }).fill(oldPassword);
    await dialog.getByRole("button", { name: "更新密码" }).click();
    await dialog
      .getByRole("status")
      .filter({ hasText: "密码已更新" })
      .waitFor();
    const change = calls.find(
      (c) => c.path === "/auth/v1/user" && c.method === "PUT",
    );
    assert.equal(change.body.current_password, oldPassword);
    assert.equal(change.body.password, newPassword);
    assert.equal(change.body.email, undefined);
    checks++;
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector("dialog");
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        dialogOverflow: dialog.scrollWidth > dialog.clientWidth,
        hasVisibleDialog: dialog.open,
      };
    });
    assert.deepEqual(metrics, {
      overflow: false,
      dialogOverflow: false,
      hasVisibleDialog: true,
    });
    checks++;
    await page.screenshot({
      path: join(screenshots, `settings-${viewport.width}.png`),
    });
    page.once("dialog", (d) => d.accept());
    await dialog.getByRole("button", { name: "退出其他设备" }).click();
    await dialog.getByRole("status").filter({ hasText: "已撤销" }).waitFor();
    assert.ok(
      calls.some(
        (c) => c.path.endsWith("/logout") && c.search === "?scope=others",
      ),
    );
    checks++;
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "退出账号", exact: true }).click();
    await page
      .getByRole("heading", { name: "账号登录", exact: true })
      .waitFor();
    assert.ok(
      calls.some(
        (c) => c.path.endsWith("/logout") && c.search === "?scope=local",
      ),
    );
    assert.equal(
      calls.some((c) => c.search === "?scope=global"),
      false,
    );
    checks++;
    await page.getByRole("button", { name: "忘记密码？" }).click();
    await page
      .getByRole("dialog")
      .getByText(/此前已有的联系渠道/)
      .waitFor();
    checks++;
    await page.getByRole("button", { name: "我知道了" }).click();
    // A disabled account gets a recoverable error, not a loading loop.
    disabled = true;
    await page.getByLabel("账号名", { exact: false }).fill("account_test");
    await page.getByLabel("密码", { exact: true }).fill(oldPassword);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page
      .getByRole("button", { name: "清除浏览器登录状态并重新开始" })
      .click();
    await page
      .getByRole("heading", { name: "账号登录", exact: true })
      .waitFor();
    checks++;
    assert.deepEqual(pageErrors, []);
    checks++;
    await context.close();
  }
  console.log(
    `${checks} browser assertions passed (fixture Auth/RPC, desktop/mobile). Screenshots: ${screenshots}`,
  );
} finally {
  await browser.close();
}
