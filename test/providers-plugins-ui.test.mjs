// UI tests for the second layer: the card shows the derived sign-in methods
// and where the card's names came from, and it offers the add entry straight
// from a browser method plus the installed plugin entry id.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listProviders } from "../lib/provider-registry.mjs";
import { mergeProviderSources } from "../lib/provider-sources.mjs";
import { providerCanSignIn } from "../ui/provider-state.js";

const root = join(import.meta.dir, "..");
const app = readFileSync(join(root, "ui", "app.js"), "utf8");
const html = readFileSync(join(root, "ui", "index.html"), "utf8");

test("provider cards render the derived methods and the list source", () => {
  expect(app).toContain("provider.authMethods");
  expect(app).toContain("methodCategory(method)");
  expect(app).toContain("methodTagText(category)");
  expect(app).toContain("providerMethodUnknownTag");
  expect(app).toContain("providerMethodPendingTag");
  expect(app).toContain("providerMethodFormTag");
  expect(app).toContain("providerMethodSecretTag");
  expect(app).toContain("providerMethodNote");
  expect(app).toContain("providerMethodBrowserTag");
  expect(app).toContain("providerMethodDeviceTag");
  // The device-code marker is defined in all four languages (en / zh-Hans /
  // zh-Hant / ja), so a device flow never falls back to "way to confirm".
  expect((app.match(/providerMethodDeviceTag:/g) || []).length).toBe(4);
  expect(app).toContain("provider.pluginPackage");
  expect(app).toContain("text.providerMethodsHeading");
  expect(app).toContain("text.providerSourceLineHeading");
  expect(app).toContain("pluginScanNote");
});

test("the provider card renders the add entry for a browser method", () => {
  const card = /function providerCard\(provider\) \{[\s\S]*?\n\}/.exec(app)?.[0] || "";
  expect(card).toContain("providerCanSignIn(provider)");
  expect(card).toContain("createElement(\"button\")");
  expect(card).toContain("text.addAccount");
  expect(card).toContain("provider-methods");
  expect(card).toContain("provider-source-line");

  const providersArea = /<div class="empty" id="providers-empty">[\s\S]*?<\/section>/.exec(html)?.[0] || "";
  expect(providersArea).toContain('id="providers-list"');
});

test("a merged card with a browser method can sign in, a key-only card cannot", () => {
  const view = mergeProviderSources({
    local: listProviders(),
    magpie: ["codex", "cursor"],
    plugins: {
      available: true,
      providers: [
        { id: "codex", package: "@x/codex", methods: [{ type: "oauth", label: "Codex (browser)", browser: true }] },
        { id: "cursor", package: "@x/cursor", methods: [{ type: "api", label: "Cursor key", browser: false, category: "key" }] },
      ],
    },
  });
  const codex = view.providers.find((provider) => provider.id === "codex");
  const cursor = view.providers.find((provider) => provider.id === "cursor");
  expect(codex.browserMethod).toBe(true);
  expect(codex.signInProvider).toBe("codex");
  expect(providerCanSignIn(codex)).toBe(true);
  expect(cursor.browserMethod).toBe(false);
  expect(providerCanSignIn(cursor)).toBe(false);
});
