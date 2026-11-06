// The Providers tab grew past one screen, so it has a search field. These
// tests pin the matching rule itself (pure, no DOM) and the markup that makes
// the rule reachable: a field in the section head, both grids narrowed, the
// collapsed section opened when a match lives there, and a "nothing matched"
// message that is not the same sentence as "nothing is installed yet".

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filterProviders, providerMatchesQuery, providerSearchText } from "../ui/provider-state.js";

const root = join(import.meta.dir, "..");
const app = readFileSync(join(root, "ui", "app.js"), "utf8");
const html = readFileSync(join(root, "ui", "index.html"), "utf8");
const css = readFileSync(join(root, "ui", "style.css"), "utf8");

function card(overrides = {}) {
  return {
    id: "sample",
    name: "Sample",
    description: { en: "A sample subscription service." },
    ...overrides,
  };
}

const loomy = card({
  id: "loomy",
  name: "Loomy",
  signInProvider: "@roadkid/opencode-loomy-auth",
  description: { en: "Loomy is a subscription service.", "zh-Hans": "Loomy 是一个订阅服务。" },
  signInMethods: ["Loomy 手机验证码登录（讯飞）"],
  signInMethodDetails: [{ label: "Loomy 手机验证码登录（讯飞）", fields: [{ key: "phone" }] }],
});

const codex = card({
  id: "codex",
  name: "ChatGPT",
  agentId: "codex",
  description: { en: "OpenAI's ChatGPT subscription." },
});

const catalogOnly = card({
  id: "some-catalog",
  name: "Some Catalog",
  presence: "catalog",
  description: { en: "Listed by the market, not installed." },
});

const cards = [loomy, codex, catalogOnly];

test("a blank query is not a search, so it returns the list untouched", () => {
  expect(filterProviders(cards, "")).toBe(cards);
  expect(filterProviders(cards, "   ")).toBe(cards);
  expect(filterProviders(cards, undefined)).toBe(cards);
  expect(filterProviders(cards, null)).toBe(cards);
});

test("a card is found by its name, whatever the case", () => {
  expect(filterProviders(cards, "loomy")).toEqual([loomy]);
  expect(filterProviders(cards, "LOOMY")).toEqual([loomy]);
  expect(filterProviders(cards, "chat")).toEqual([codex]);
});

test("a card is found by the id the service knows it by", () => {
  expect(filterProviders(cards, "codex")).toEqual([codex]);
  expect(filterProviders(cards, "some-catalog")).toEqual([catalogOnly]);
});

test("a card is found by the plugin package that provides its sign-in", () => {
  expect(filterProviders(cards, "@roadkid/opencode-loomy-auth")).toEqual([loomy]);
  expect(filterProviders(cards, "roadkid")).toEqual([loomy]);
});

test("a card is found by the label of a sign-in method, in its own script", () => {
  expect(filterProviders(cards, "讯飞")).toEqual([loomy]);
  expect(filterProviders(cards, "手机验证码")).toEqual([loomy]);
});

test("a card is found by its description in the page's language", () => {
  expect(filterProviders(cards, "订阅服务", "zh-Hans")).toEqual([loomy]);
  // The English description is the fallback when the language is missing, so
  // a search typed in English still works on a page set to another language.
  expect(filterProviders(cards, "subscription", "zh-Hans")).toEqual([loomy, codex]);
});

test("every word of the query has to match, in any order", () => {
  expect(filterProviders(cards, "loomy 讯飞")).toEqual([loomy]);
  expect(filterProviders(cards, "讯飞 loomy")).toEqual([loomy]);
  expect(filterProviders(cards, "loomy chatgpt")).toEqual([]);
});

test("a query that matches nothing returns nothing, never everything", () => {
  expect(filterProviders(cards, "zzz-no-such-provider")).toEqual([]);
});

test("a malformed catalog is treated as empty, not as a crash", () => {
  expect(filterProviders(null, "loomy")).toEqual([]);
  expect(filterProviders(undefined, "loomy")).toEqual([]);
  expect(filterProviders("nope", "loomy")).toEqual([]);
  expect(filterProviders([null, {}], "loomy")).toEqual([]);
  expect(filterProviders([null, {}], "")).toEqual([null, {}]);
});

test("the searchable text is built from the fields a card actually has", () => {
  expect(providerSearchText(loomy)).toContain("loomy");
  expect(providerSearchText(loomy)).toContain("@roadkid/opencode-loomy-auth");
  expect(providerSearchText(loomy)).toContain("讯飞");
  expect(providerSearchText(loomy)).toContain("subscription service");
  expect(providerSearchText(codex)).toContain("codex");
  expect(providerSearchText(null)).toBe("");
  expect(providerMatchesQuery(loomy, "loomy")).toBe(true);
  expect(providerMatchesQuery(loomy, "")).toBe(true);
});

test("the field lives in the section head and is a search input, not a submit one", () => {
  const head = html.slice(html.indexOf('id="panel-providers"'), html.indexOf('id="environment-setup"'));
  expect(head).toContain('id="providers-search"');
  expect(head).toContain('type="search"');
  expect(head).toContain('for="providers-search"');
  expect(head).toContain('id="providers-search-label"');
  expect(head).toContain('id="providers-search-status"');
  expect(head).toContain('role="status"');
  expect(head).toContain('class="search-field"');
  expect(head).not.toMatch(/type\s*=\s*"submit"/);
  expect(head).not.toMatch(/onclick=/);
});

test("both grids are narrowed, and the collapsed one is opened when a match hides there", () => {
  expect(app).toContain("filterProviders(primary, providerQuery, langKey)");
  expect(app).toContain("filterProviders(other, providerQuery, langKey)");
  expect(app).toContain('byId("providers-more-count").textContent = String(shownOther.length)');
  expect(app).toContain("function revealProviderMatches()");
  expect(app).toContain("if (byId(\"providers-more-list\").children.length > 0) more.open = true;");
  // The keystroke opens the section; a data refresh must not undo a collapse.
  expect(app).toContain('for (const event of ["input", "search"])');
  expect(app).toContain("renderProviders(providerCatalog);");
  expect(app).toContain("revealProviderMatches();");
});

test("an empty grid says which kind of empty it is", () => {
  expect(app).toContain("const noMatch = searching && providerCatalog.length > 0;");
  expect(app).toContain("noMatch ? text.providersNoMatchTitle : text.providersEmptyTitle");
  expect(app).toContain("noMatch ? text.providersNoMatchCopy : text.providersEmptyCopy");
  expect(app).toContain('text.providersSearchCount');
  expect(app).toContain('.replace("{shown}", String(shown))');
  expect(app).toContain('.replace("{total}", String(providerCatalog.length))');
});

test("every language carries the search wording", () => {
  for (const key of [
    "providersSearchLabel",
    "providersSearchPlaceholder",
    "providersSearchCount",
    "providersNoMatchTitle",
    "providersNoMatchCopy",
  ]) {
    const hits = app.split(`${key}:`).length - 1;
    expect({ key, hits }).toEqual({ key, hits: 4 });
  }
  expect(app).toContain('byId("providers-search").placeholder = text.providersSearchPlaceholder;');
  expect(app).toContain('byId("providers-search-label").textContent = text.providersSearchLabel;');
});

test("the field is styled for both widths", () => {
  expect(css).toContain(".search-field {");
  expect(css).toContain(".search-input {");
  expect(css).toContain(".search-status {");
  expect(css).toMatch(/\.search-field \{ width: 100%; min-width: 0; \}/);
});
