// Ordering of the sign-in dialog's exit picker. A provider's previous login
// history decides which exits are fresh; the picker never mutates the stored
// proxy list or sends another request.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIGN_IN_PROXY_TEST_CONCURRENCY,
  formatSignInProxyOption,
  orderSignInProxies,
  probeSignInProxies,
  usedSignInProxies,
} from "../ui/signin-state.js";

const root = join(import.meta.dir, "..");
const app = readFileSync(join(root, "ui", "app.js"), "utf8");

const proxy = (id, name) => ({ id, name, host: "127.0.0.1", port: 18000 });
const account = (provider, loginHistory, lastLogin = null) => ({
  provider,
  loginHistory,
  lastLogin,
});

const nodes = [
  proxy("used", "R0-1|香港-NF|BGP静态"),
  proxy("other10", "R10-1|日本-NF|NTT"),
  proxy("home", "R2-1|香港-NF|HKT家宽"),
  proxy("other2", "R2-2|日本-NF|KDDI"),
  proxy("static", "R3-1|香港-NF|BGP静态"),
];

test("unused static, residential and other exits lead; used exits are last", () => {
  const accounts = [account("zcode", [{ proxyId: "used", proxyName: "R0-1|香港-NF|BGP静态" }])];
  expect(orderSignInProxies(nodes, accounts, "zcode").map((item) => item.id)).toEqual([
    "static",
    "home",
    "other2",
    "other10",
    "used",
  ]);
});

test("history belongs only to its provider and includes the last login fallback", () => {
  const accounts = [
    account("another", [{ proxyId: "static", proxyName: "R3-1|香港-NF|BGP静态" }]),
    account("zcode", [], { proxyId: "home", proxyName: "R2-1|香港-NF|HKT家宽" }),
  ];
  expect(orderSignInProxies(nodes, accounts, "zcode").map((item) => item.id)).toEqual([
    "used",
    "static",
    "other2",
    "other10",
    "home",
  ]);
});

test("a rebuilt proxy id still counts as used when the node name is unchanged", () => {
  const accounts = [account("zcode", [{ proxyId: "old-id", proxyName: "R3-1|香港-NF|BGP静态" }])];
  const used = usedSignInProxies(accounts, "zcode");
  expect(used.ids.has("old-id")).toBe(true);
  expect(used.names.has("r3-1|香港-nf|bgp静态")).toBe(true);
  expect(orderSignInProxies(nodes, accounts, "zcode").at(-1).id).toBe("static");
});

test("direct-login snapshots and malformed data never mark a real proxy used", () => {
  const accounts = [
    account("zcode", [null, { proxyId: null, proxyName: "直连" }]),
    null,
    account("zcode"),
  ];
  expect(orderSignInProxies(nodes, accounts, "zcode").map((item) => item.id)).toEqual([
    "used",
    "static",
    "home",
    "other2",
    "other10",
  ]);
  expect(orderSignInProxies(null, null, "zcode")).toEqual([]);
});

test("sorting is stable for equal names and does not mutate the bootstrap list", () => {
  const original = [proxy("b", "same"), proxy("a", "same")];
  const ordered = orderSignInProxies(original, [], "zcode");
  expect(ordered.map((item) => item.id)).toEqual(["b", "a"]);
  expect(original.map((item) => item.id)).toEqual(["b", "a"]);
  expect(ordered).not.toBe(original);
});

test("the dialog uses the provider history and rerenders without losing the selection", () => {
  expect(app).toContain("orderSignInProxies(proxies, accountIdentities, signInContext?.provider)");
  expect(app).toContain("renderSignInAccounts(signInContext.provider);\n    renderSignInProxies();");
  expect(app).toContain("select.value = ordered.some((proxy) => proxy.id === previous) ? previous : \"\";");
});

test("sign-in proxy option text shows live testing state, measured latency or failure", () => {
  const labels = {
    statusTesting: "正在测试…",
    statusOk: "可用",
    statusError: "失败",
    statusUntested: "未检测",
  };
  const base = { id: "r3-1", name: "R3-1|香港-NF|BGP静态", host: "127.0.0.1", port: 18106 };

  expect(formatSignInProxyOption(base, labels, false)).toBe(
    "R3-1|香港-NF|BGP静态 · 127.0.0.1:18106",
  );
  expect(formatSignInProxyOption(base, labels, true)).toBe(
    "R3-1|香港-NF|BGP静态 · 127.0.0.1:18106 · 正在测试…",
  );
  expect(
    formatSignInProxyOption({ ...base, status: "ok", latency: 42 }, labels, false),
  ).toBe("R3-1|香港-NF|BGP静态 · 127.0.0.1:18106 · 42 ms");
  expect(
    formatSignInProxyOption({ ...base, status: "ok", latency: 0 }, labels, false),
  ).toBe("R3-1|香港-NF|BGP静态 · 127.0.0.1:18106 · 0 ms");
  expect(
    formatSignInProxyOption({ ...base, status: "ok", latency: null }, labels, false),
  ).toBe("R3-1|香港-NF|BGP静态 · 127.0.0.1:18106 · 可用");
  expect(
    formatSignInProxyOption({ ...base, status: "error", error: "Timed out" }, labels, false),
  ).toBe("R3-1|香港-NF|BGP静态 · 127.0.0.1:18106 · 失败");
});

test("probeSignInProxies tests candidates with bounded concurrency and stops on abort", async () => {
  const list = Array.from({ length: 10 }, (_, index) =>
    proxy(`p-${index + 1}`, `Node-${index + 1}`),
  );
  let active = 0;
  let maxActive = 0;
  const started = [];
  const results = [];

  await probeSignInProxies(
    list,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (item.id === "p-3") throw new Error("boom");
      return { ok: true, latency: 20 };
    },
    {
      concurrency: 3,
      onStart(item) {
        started.push(item.id);
      },
      onResult(item, data, error) {
        results.push({ id: item.id, ok: Boolean(data?.ok), failed: Boolean(error) });
      },
    },
  );

  expect(SIGN_IN_PROXY_TEST_CONCURRENCY).toBe(4);
  expect(maxActive).toBeLessThanOrEqual(3);
  expect(started).toHaveLength(10);
  expect(results).toHaveLength(10);
  expect(results.find((item) => item.id === "p-3")).toEqual({
    id: "p-3",
    ok: false,
    failed: true,
  });

  const controller = new AbortController();
  const seenAfterAbort = [];
  await probeSignInProxies(
    list,
    async (item) => {
      if (item.id === "p-2") controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true };
    },
    {
      concurrency: 2,
      signal: controller.signal,
      onResult(item) {
        seenAfterAbort.push(item.id);
      },
    },
  );
  expect(seenAfterAbort.length).toBeLessThan(list.length);
});

test("the sign-in dialog probes each candidate proxy and cancels probes on cleanup", () => {
  expect(app).toContain("formatSignInProxyOption(");
  expect(app).toContain("probeSignInProxies(");
  expect(app).toContain("api(`api/proxies/${encodeURIComponent(proxy.id)}/test`");
  expect(app).toContain("cancelSignInProxyTests();");
});
