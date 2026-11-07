import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
const url = process.env.HARNESS_PREVIEW_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
});
await mkdir("/tmp/harness-ui", { recursive: true });
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
async function waitFor(fn) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail("UI state did not arrive");
}
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const mobile = viewport.width < 800;
    const context = await browser.newContext({ viewport });
    await context.route("https://fontsapi.zeoseven.com/**", route => route.abort());
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole("button", { name: "跑团工作台", exact: true }).click();
    await page.getByRole("heading", { name: "把规则放上桌。" }).waitFor();
    check(await page.getByText("本机演示 · 不跨设备联机").isVisible(), "demo label is explicit");
    await page.locator(".harness-templates").getByRole("button", { name: "调查" }).click();
    await page.getByRole("button", { name: "应用修改", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "公告板", exact: true }).click();
    await waitFor(async () => await page.locator(".harness-block").count() === 3);
    check(await page.getByRole("heading", { name: "调查经费", exact: true }).isVisible(), "template rendered");
    // Add a second instance and make it private.
    await page.getByRole("button", { name: "添加组件", exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("GM 真相");
    await page.getByLabel("内容", { exact: true }).fill("幕后主使");
    await page.getByLabel("谁能看到").selectOption("gm");
    await page.getByRole("button", { name: "预览修改", exact: true }).click();
    await page.getByRole("button", { name: "应用修改", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "公告板", exact: true }).click();
    await waitFor(async () => await page.locator(".harness-block").count() === 4);
    // Player view must hide private data and structural controls.
    await page.getByLabel("演示身份", { exact: true }).selectOption("player");
    await waitFor(async () => await page.locator(".harness-block").count() === 3);
    check(await page.getByText("幕后主使").count() === 0, "private text is absent from player DOM");
    check(await page.getByRole("button", { name: "添加组件", exact: true }).count() === 0, "player cannot add blocks");
    await page.getByRole("button", { name: "调查经费减少 1", exact: true }).click();
    await page.getByRole("button", { name: "应用修改", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "公告板", exact: true }).click();
    await waitFor(async () => await page.locator(".harness-counter strong").last().textContent() === "9");
    // A second client sees the saved value, and configuration changes preserve it.
    const gm = await context.newPage();
    await gm.goto(url);
    await gm.getByRole("button", { name: "跑团工作台", exact: true }).click();
    await waitFor(async () => await gm.locator(".harness-block").count() === 4);
    const resource = gm.locator(".harness-block").filter({ has: gm.getByRole("heading", { name: "调查经费", exact: true }) });
    check(await resource.locator(".harness-counter strong").textContent() === "9", "second client reads saved state");
    await resource.getByRole("button", { name: "编辑", exact: true }).click();
    await gm.getByLabel("名称", { exact: true }).fill("公共经费");
    await gm.getByLabel("上限", { exact: true }).fill("20");
    await gm.getByRole("button", { name: "预览修改", exact: true }).click();
    await gm.getByRole("button", { name: "应用修改", exact: true }).click();
    await waitFor(async () => await page.getByRole("heading", { name: "公共经费", exact: true }).count() === 1);
    check(await page.locator(".harness-counter strong").last().textContent() === "9", "configuration preserves player data");
    // Stale proposals become visibly unusable after another client edits.
    await page.getByRole("button", { name: "公共经费减少 1", exact: true }).click();
    if (mobile) await gm.getByRole("button", { name: "公告板", exact: true }).click();
    await gm.getByRole("button", { name: "公共经费增加 1", exact: true }).click();
    await gm.getByRole("button", { name: "应用修改", exact: true }).click();
    await waitFor(async () => await page.getByText("房间已更新，请取消后重新生成。").count() === 1);
    check(await page.getByRole("button", { name: "应用修改", exact: true }).isDisabled(), "stale proposal cannot overwrite new data");
    await page.getByRole("button", { name: "取消修改", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "公告板", exact: true }).click();
    if (mobile) await gm.getByRole("button", { name: "公告板", exact: true }).click();
    await gm.locator(".harness-block").filter({ has: gm.getByRole("heading", { name: "GM 真相", exact: true }) })
      .getByRole("button", { name: "编辑", exact: true }).click();
    await gm.getByLabel("内容", { exact: true }).fill("过期草稿");
    await page.getByRole("button", { name: "公共经费减少 1", exact: true }).click();
    await page.getByRole("button", { name: "应用修改", exact: true }).click();
    await waitFor(async () => await gm.locator(".harness-counter strong").last().textContent() === "9");
    await gm.getByRole("button", { name: "预览修改", exact: true }).click();
    if (mobile) await gm.getByRole("button", { name: "助手", exact: true }).click();
    check(await gm.getByText("房间已有新修改。已刷新公告板，请重新预览后提交。").isVisible(), "stale editor cannot adopt a new revision");
    if (mobile) await gm.getByRole("button", { name: "公告板", exact: true }).click();
    await gm.getByRole("button", { name: "关闭组件编辑", exact: true }).click();
    if (mobile) await page.getByRole("button", { name: "公告板", exact: true }).click();
    await page.getByLabel("演示身份", { exact: true }).selectOption("observer");
    await waitFor(async () => await page.getByRole("button", { name: "公共经费减少 1", exact: true }).count() === 0);
    check(await page.locator(".harness-block").count() === 3, "observer is read-only");
    if (mobile) await gm.getByRole("button", { name: "公告板", exact: true }).click();
    check(await gm.locator(".harness").evaluate(el => el.scrollWidth <= el.clientWidth), "no horizontal viewport overflow");
    await gm.locator(".harness-board-pane").evaluate(el => { el.scrollTop = 0; });
    await gm.screenshot({ path: `/tmp/harness-ui/${mobile ? "mobile" : "desktop"}.png`, animations: "disabled" });
    await gm.getByRole("button", { name: "返回汉堡店公告板", exact: true }).click();
    await gm.getByRole("button", { name: "跑团工作台", exact: true }).click();
    await waitFor(async () => await gm.locator(".harness-block").count() === 4);
    check(await gm.getByRole("heading", { name: "公共经费", exact: true }).isVisible(), "navigation restores board data");
    check(errors.length === 0, `no runtime errors: ${errors.join(", ")}`);
    await context.close();
  }
  console.log(`Harness browser: ${checks} assertions passed across desktop/mobile and two clients.`);
} catch (error) {
  for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
    await page.screenshot({ path: `/tmp/harness-ui/failure-${index}.png`, animations: "disabled" });
    console.error("Failure page", index, await page.locator(".harness-editor").count(), await page.locator(".harness-banner").allTextContents());
  }
  throw error;
} finally { await browser.close(); }
