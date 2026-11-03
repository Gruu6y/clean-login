// The account identity routes. A temporary data directory holds the account
// layout and a temporary magpie config directory holds `plugin-auth.json`, so
// the real `readAccountMeta`/`removeAccountDir` run without touching the real
// ~/.config/magpie.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOKEN_HEADER, startServer } from "../lib/server.mjs";
import { accountDir, readAccountMeta, writeAccountMeta } from "../lib/account-identity.mjs";

const tmp = mkdtempSync(join(tmpdir(), "clean-login-accounts-routes-"));
const dataDir = join(tmp, "data");
const configDir = join(tmp, "magpie-config");
let service;
let token;

const signedInDir = accountDir({ MAGPIE_CLEAN_LOGIN_DATA: dataDir }, "workbuddy", "workbuddy");
const retiredDir = accountDir({ MAGPIE_CLEAN_LOGIN_DATA: dataDir }, "workbuddy", "workbuddy#ab12");

beforeAll(async () => {
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, "plugin-auth.json"),
    JSON.stringify({ workbuddy: { type: "oauth", access: "SECRET", accountId: "signed-in" } }),
  );
  await writeAccountMeta(signedInDir, {
    version: 1,
    provider: "workbuddy",
    key: "workbuddy",
    accountId: "signed-in",
    uid: "u-1",
    signedInAt: "2026-11-03T10:00:00.000Z",
  });
  await writeAccountMeta(retiredDir, {
    version: 1,
    provider: "workbuddy",
    key: "workbuddy#ab12",
    accountId: "retired",
    uid: "u-2",
    signedInAt: "2026-11-02T09:00:00.000Z",
  });
  // A directory with no ledger must never show up in the account list.
  await mkdir(accountDir({ MAGPIE_CLEAN_LOGIN_DATA: dataDir }, "workbuddy", "workbuddy#no-ledger"), {
    recursive: true,
  });

  service = await startServer({
    port: 0,
    env: {
      ...process.env,
      MAGPIE_CONFIG_DIR: configDir,
      MAGPIE_CLEAN_LOGIN_DATA: dataDir,
    },
    dataDir,
    pluginScanner: {
      get: () => ({ available: false, providers: [], scanned: false, stale: false, scanning: false, error: null }),
      warm: () => {},
    },
  });
  await service.prune();
  const html = await (await fetch(`http://127.0.0.1:${service.port}/`)).text();
  token = /name="clean-login-token" content="([0-9a-f]+)"/.exec(html)?.[1];
});

afterAll(async () => {
  await service?.close();
  rmSync(tmp, { recursive: true, force: true });
});

function api(method, path, { withToken = true } = {}) {
  const headers = withToken ? { [TOKEN_HEADER]: token } : {};
  return fetch(`http://127.0.0.1:${service.port}${path}`, { method, headers });
}

test("GET /api/accounts lists the ledger fields and the signed-in flag", async () => {
  const res = await api("GET", "/api/accounts");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.accounts).toEqual([
    {
      provider: "workbuddy",
      key: "workbuddy",
      accountId: "signed-in",
      uid: "u-1",
      signedInAt: "2026-11-03T10:00:00.000Z",
      signedIn: true,
    },
    {
      provider: "workbuddy",
      key: "workbuddy#ab12",
      accountId: "retired",
      uid: "u-2",
      signedInAt: "2026-11-02T09:00:00.000Z",
      signedIn: false,
    },
  ]);
  // No path and no credential in the response.
  const text = JSON.stringify(body);
  expect(text).not.toContain(tmp);
  expect(text).not.toContain("SECRET");
});

test("GET /api/accounts requires the page token", async () => {
  const res = await api("GET", "/api/accounts", { withToken: false });
  expect(res.status).toBe(403);
});

test("GET /api/accounts rejects another method", async () => {
  const res = await api("POST", "/api/accounts");
  expect(res.status).toBe(405);
  expect(res.headers.get("allow")).toBe("GET");
});

test("DELETE refuses a signed-in account with 409 and keeps its directory", async () => {
  const res = await api("DELETE", "/api/accounts/workbuddy/workbuddy");
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({
    error: "signed_in",
    message: "This account is still signed in; sign out first.",
  });
  expect(existsSync(signedInDir)).toBe(true);
  expect(await readAccountMeta(signedInDir)).toBeTruthy();
});

test("DELETE removes a signed-out identity and its ledger", async () => {
  const res = await api("DELETE", "/api/accounts/workbuddy/workbuddy%23ab12");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(existsSync(retiredDir)).toBe(false);
});

test("DELETE on a directory without a ledger is a 404", async () => {
  const res = await api("DELETE", "/api/accounts/workbuddy/workbuddy%23no-ledger");
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("not_found");
});

test("DELETE on an unknown account is a 404", async () => {
  const res = await api("DELETE", "/api/accounts/workbuddy/workbuddy%23unknown");
  expect(res.status).toBe(404);
});

test("DELETE rejects another method", async () => {
  const res = await api("GET", "/api/accounts/workbuddy/workbuddy");
  expect(res.status).toBe(405);
  expect(res.headers.get("allow")).toBe("DELETE");
});

// With no readable key set the service cannot tell a signed-in account from a
// signed-out one, so it reports the flag it can prove (false) and refuses the
// delete rather than risk a live credential's pin.
test("an unreadable auth file reports signedIn=false and refuses the delete", async () => {
  await writeFile(join(configDir, "plugin-auth.json"), "{ not json");
  const list = await api("GET", "/api/accounts");
  expect(list.status).toBe(200);
  const body = await list.json();
  expect(body.accounts.length).toBeGreaterThan(0);
  expect(body.accounts.every((account) => account.signedIn === false)).toBe(true);

  const res = await api("DELETE", "/api/accounts/workbuddy/workbuddy");
  expect(res.status).toBe(503);
  expect((await res.json()).error).toBe("auth_unreadable");
  expect(existsSync(signedInDir)).toBe(true);
});
