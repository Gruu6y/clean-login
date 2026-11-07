// Ordering of the sign-in dialog's exit picker. A provider's previous login
// history decides which exits are fresh; the picker never mutates the stored
// proxy list or sends another request.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { orderSignInProxies, usedSignInProxies } from "../ui/signin-state.js";

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
