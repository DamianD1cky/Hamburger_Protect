// Real UI with isolated Auth/RPC responses. No production accounts are reviewed.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = new URL(loadEnv("supabase", process.cwd(), "VITE_").VITE_SUPABASE_URL).origin;
const storageKey = `sb-${new URL(origin).hostname.split(".")[0]}-auth-token`;
const authId = "10000000-0000-4000-8000-000000000010";
const actorId = "20000000-0000-4000-8000-000000000010";
const user = { id: authId, email: "owner@gm.local", aud: "authenticated", role: "authenticated", is_anonymous: false,
  user_metadata: { displayName: "站长", site_admin: true }, app_metadata: { provider: "email", providers: ["email"] } };
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = { access_token: `e30.${Buffer.from(JSON.stringify({ sub: authId, exp })).toString("base64url")}.test`,
  refresh_token: "test-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
});
const screenshots = join(tmpdir(), "hp-site-admin-ui");
await mkdir(screenshots, { recursive: true });
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(({ storageKey, session }) => localStorage.setItem(storageKey, JSON.stringify(session)), { storageKey, session });
    let isAdmin = false, rejectOnce = false;
    const errors = [], reviews = [];
    const applications = ["qingcheng", "other", "disabled"].map((name, i) => ({
      user_id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      account_name: `${name}@gm.local`, display_name: i ? name : "青城",
      requested_at: `2026-11-16T12:00:0${i}Z`, status: "pending", reviewed_at: null,
      review_note: "", unavailable: name === "disabled", reviewer_name: null,
    }));
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname, body = request.postDataJSON();
      let result = [], status = 200;
      if (path.endsWith("/get_service_status")) result = "ready";
      else if (path.endsWith("/ensure_actor")) result = { id: actorId, display_name: "站长", disabled: false };
      else if (path.endsWith("/get_site_admin_access")) result = isAdmin;
      else if (path.endsWith("/get_gm_access")) result = null;
      else if (path === "/auth/v1/user") result = user;
      else if (path.endsWith("/list_gm_applications")) {
        if (!isAdmin) { status = 403; result = { message: "SITE_ADMIN_REQUIRED" }; }
        else result = { applications: applications.filter((item) => (item.status === "pending") === (body.p_view === "pending")), has_more: false };
      } else if (path.endsWith("/review_gm_application")) {
        reviews.push(body);
        if (!isAdmin) { status = 403; result = { message: "SITE_ADMIN_REQUIRED" }; }
        else if (rejectOnce) { rejectOnce = false; status = 409; result = { message: "GM_APPLICATION_ALREADY_REVIEWED" }; }
        else {
          const item = applications.find((item) => item.user_id === body.p_user_id);
          item.status = body.p_approved ? "approved" : "rejected"; item.review_note = body.p_note;
          item.reviewed_at = new Date().toISOString(); item.reviewer_name = "站长";
          result = item;
        }
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.HP_PREVIEW_URL || "http://127.0.0.1:5174");
    await page.getByRole("button", { name: "账号设置", exact: true }).waitFor();
    check(await page.getByRole("button", { name: "GM 申请审批", exact: true }).count() === 0,
      "owner username and editable metadata cannot show the administrator entry");
    isAdmin = true;
    await page.reload();
    await page.getByRole("button", { name: "GM 申请审批", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "GM 申请审批", exact: true });
    const qingcheng = dialog.getByRole("article", { name: "GM 申请：qingcheng", exact: true });
    await qingcheng.waitFor();
    check(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth), "administrator panel fits the viewport");
    check(await dialog.getByRole("article", { name: "GM 申请：disabled", exact: true }).getByRole("button", { name: "批准", exact: true }).isDisabled(),
      "unavailable applicants cannot be approved");
    await qingcheng.getByLabel("给 qingcheng 的审批备注").fill("已核实本人");
    rejectOnce = true;
    await qingcheng.getByRole("button", { name: "批准", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "已被处理" }).waitFor();
    check(applications[0].status === "pending", "a stale review failure never claims approval succeeded");
    await qingcheng.getByRole("button", { name: "批准", exact: true }).click();
    await dialog.getByRole("status").filter({ hasText: "qingcheng 已批准" }).waitFor();
    await qingcheng.waitFor({ state: "detached" });
    check(reviews.at(-1).p_user_id === applications[0].user_id &&
      reviews.at(-1).p_expected_requested_at === applications[0].requested_at && reviews.at(-1).p_note === "已核实本人",
      "UI sends the stable applicant ID, expected request version and review note");
    const other = dialog.getByRole("article", { name: "GM 申请：other", exact: true });
    await other.getByRole("button", { name: "拒绝", exact: true }).click();
    await dialog.getByRole("status").filter({ hasText: "other 已拒绝" }).waitFor();
    check(reviews.at(-1).p_approved === false, "the reject action uses the controlled review RPC");
    await dialog.getByRole("button", { name: "已处理", exact: true }).click();
    await dialog.getByRole("article", { name: "GM 申请：qingcheng", exact: true }).getByText("已批准", { exact: true }).waitFor();
    check(await dialog.getByText("已核实本人", { exact: true }).isVisible(), "processing history includes the saved note");
    await page.screenshot({ path: join(screenshots, `gm-review-${width}.png`) });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    check(await page.getByRole("button", { name: "GM 申请审批", exact: true }).evaluate((node) => node === document.activeElement),
      "closing approval restores focus to its entry");
    await page.getByRole("button", { name: "GM 申请审批", exact: true }).click();
    await dialog.getByRole("article", { name: "GM 申请：disabled", exact: true }).waitFor();
    isAdmin = false;
    await dialog.getByRole("article", { name: "GM 申请：disabled", exact: true }).getByRole("button", { name: "拒绝", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    check(await page.getByRole("button", { name: "GM 申请审批", exact: true }).count() === 0,
      "revoking server authority removes the panel and administrator entry");
    check(applications[2].status === "pending", "a revoked admin cannot change an application");
    check(errors.length === 0, `no browser errors: ${errors.join("; ")}`);
    await context.close();
  }
  console.log(`${checks} GM approval browser assertions passed (isolated Auth/RPC, desktop/mobile). Screenshots: ${screenshots}`);
} finally { await browser.close(); }
