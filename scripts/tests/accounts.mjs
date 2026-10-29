import test from "node:test";
import assert from "node:assert/strict";
import { createSessionStore } from "../../src/features/access/domain/sessionStore.ts";
import {
  validateNewPassword,
  validateDisplayName,
  usernameToEmail,
  getAccessErrorMessage,
} from "../../src/features/access/domain/account.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("a profile request finishing after logout cannot revive the account", async () => {
  const store = createSessionStore();
  const request = deferred();
  const load = store.load("user-a", () => request.promise);
  store.clear();
  request.resolve({ id: "a" });
  await assert.rejects(load, /SESSION_CHANGED/);
  assert.equal(store.peek(), null);
});
test("slower previous account cannot overwrite a newly signed-in account", async () => {
  const store = createSessionStore();
  const request = deferred();
  const previous = store.load("user-a", () => request.promise);
  await store.load("user-b", async () => ({ id: "b" }));
  request.resolve({ id: "a" });
  await assert.rejects(previous, /SESSION_CHANGED/);
  assert.deepEqual(store.peek(), { id: "b" });
});
test("profile eligibility is checked again after the cache lifetime", async () => {
  let now = 0;
  const store = createSessionStore(() => now, 30_000);
  await store.load("user-a", async () => ({ id: "a" }));
  now = 30_000;
  await assert.rejects(
    store.load("user-a", async () => {
      throw new Error("ACCOUNT_DISABLED");
    }),
    /ACCOUNT_DISABLED/,
  );
  assert.equal(store.peek(), null);
});
test("identical concurrent profile loads share one request", async () => {
  const store = createSessionStore();
  let count = 0;
  await Promise.all([
    store.load("a", async () => {
      count++;
      return 1;
    }),
    store.load("a", async () => {
      count++;
      return 1;
    }),
  ]);
  assert.equal(count, 1);
});
test("refreshed access token bypasses cached account information", async () => {
  const store = createSessionStore();
  await store.load("a:old-token", async () => "old name");
  assert.equal(
    await store.load("a:new-token", async () => "new name"),
    "new name",
  );
});
test("new passwords support passphrases, reject mismatch and bcrypt overflow", () => {
  assert.doesNotThrow(() =>
    validateNewPassword(
      "long passphrase with spaces",
      "long passphrase with spaces",
    ),
  );
  assert.doesNotThrow(() =>
    validateNewPassword("x".repeat(64), "x".repeat(64)),
  );
  assert.doesNotThrow(() =>
    validateNewPassword("字".repeat(24), "字".repeat(24)),
  );
  assert.throws(
    () => validateNewPassword("x".repeat(14), "x".repeat(14)),
    /PASSWORD_TOO_SHORT/,
  );
  assert.throws(
    () => validateNewPassword("password that is long", "different"),
    /PASSWORD_MISMATCH/,
  );
  assert.throws(
    () => validateNewPassword("x".repeat(73), "x".repeat(73)),
    /PASSWORD_TOO_LONG/,
  );
  assert.throws(
    () => validateNewPassword("字".repeat(25), "字".repeat(25)),
    /PASSWORD_TOO_LONG/,
  );
});
test("account validation rejects blank names and invalid usernames", () => {
  assert.equal(validateDisplayName("  阿强  "), "阿强");
  assert.throws(() => validateDisplayName("   "), /INVALID_DISPLAY_NAME/);
  assert.throws(
    () => validateDisplayName("字".repeat(33)),
    /INVALID_DISPLAY_NAME/,
  );
  assert.equal(usernameToEmail("  GM_01  "), "gm_01@gm.local");
  assert.throws(() => usernameToEmail("bad@other.test"), /INVALID_USERNAME/);
});
test("known Auth errors are understandable and unknown details stay private", () => {
  assert.equal(
    getAccessErrorMessage({ code: "invalid_credentials", message: "raw" }),
    "账号或密码不正确。",
  );
  assert.equal(
    getAccessErrorMessage({ message: "ONE_ACTIVE_CAMPAIGN_PER_PLAYER" }),
    "你已经参加了一个仍在营业的战役，不能重复入店。",
  );
  assert.equal(
    getAccessErrorMessage({ code: "user_banned" }),
    "账号已停用，请联系站长。",
  );
  assert.ok(
    !getAccessErrorMessage(new Error("secret infrastructure detail")).includes(
      "secret",
    ),
  );
});
