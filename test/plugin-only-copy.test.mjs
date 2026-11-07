// A plugin-only card once said the same thing three times: its description,
// its presence note and its notice were three near-copies of one sentence
// about magpie's provider list being unreadable. These guards pin the split:
// one line for where the provider came from, one line for what the list read
// means, and one line for the method (or the lack of a classifiable one).
//
// They read the shipped source as text (no DOM, no browser) and also build real
// cards through the merge, so both the copy and the renderer stay honest.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listProviders } from "../lib/provider-registry.mjs";
import { mergeProviderSources } from "../lib/provider-sources.mjs";
import { localizedText } from "../ui/provider-state.js";

const root = join(import.meta.dir, "..");
const sources = readFileSync(join(root, "lib", "provider-sources.mjs"), "utf8").replaceAll("\r\n", "\n");
const app = readFileSync(join(root, "ui", "app.js"), "utf8").replaceAll("\r\n", "\n");
const LOCAL = listProviders();
const LANGS = ["en", "zh-Hans", "zh-Hant", "ja"];

const METHODS = [
  {
    name: "a browser method",
    methods: [{ type: "oauth", label: "Browser sign-in", browser: true, category: "browser", runnable: true }],
  },
  {
    name: "an open-ended method",
    methods: [{ type: "oauth", label: "Open-ended sign-in", browser: false, category: "pending", runnable: true }],
  },
  {
    name: "no classifiable method",
    methods: [{ type: "api", label: "API key", browser: false, category: "key", runnable: false }],
  },
];

const STATES = [
  { name: "an unreadable magpie list", magpie: undefined },
  { name: "a readable magpie list", magpie: ["codex"] },
];

function pluginOnlyCard(magpie, methods) {
  const view = mergeProviderSources({
    local: LOCAL,
    magpie,
    plugins: { available: true, providers: [{ id: "demo-plugin", package: "@example/demo-plugin", methods }] },
  });
  return view.providers.find((provider) => provider.presence === "plugin-only");
}

function sentences(lines) {
  return lines
    .flatMap((line) => line.split(/[.!?。！？]/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

// --- 1. the copy is defined once per job, not once per slot ----------------

test("the plugin-only copy has one source line and one method line", () => {
  expect(sources).toContain("const PLUGIN_ONLY_DESCRIPTION = Object.freeze({");
  expect(sources).toContain("const PLUGIN_ONLY_METHOD_REASON = Object.freeze({");
  expect(sources).toContain("description: PLUGIN_ONLY_DESCRIPTION,");
  expect(sources).toContain("reason: PLUGIN_ONLY_METHOD_REASON,");
});

test("the presence note no longer copies the notice onto the same card", () => {
  expect(sources).not.toContain("presenceNote: { ...copy.note }");
  expect(sources).toContain("presenceNote: null,");
  // The old three-way duplication is gone from the constants entirely.
  expect(sources).not.toContain("magpie's own provider list could not be read this time");
});

// --- 2. the renderer refuses to print a duplicate line --------------------

test("the card renderer drops a repeated line instead of showing it twice", () => {
  expect(app).toContain("if (reason.textContent) card.append(reason);");
  expect(app).toContain("const shownLines = new Set(");
  expect(app).toContain("!shownLines.has(presenceNode.textContent)");
  expect(app).toContain("!shownLines.has(notice.textContent)");
});

// --- 3. real cards, every language, every method shape --------------------

for (const state of STATES) {
  for (const shape of METHODS) {
    test(`${state.name} + ${shape.name}: no sentence appears twice on one card`, () => {
      const card = pluginOnlyCard(state.magpie, shape.methods);
      expect(card).toBeTruthy();
      expect(card.presenceNote).toBeNull();
      for (const lang of LANGS) {
        const lines = [
          localizedText(card.description, lang),
          localizedText(card.capability.reason, lang),
          localizedText(card.presenceNote, lang),
          localizedText(card.notice, lang),
        ].filter(Boolean);
        // Three distinct jobs: source, method, and the one line about the list.
        expect(lines).toHaveLength(3);
        expect(new Set(lines).size).toBe(lines.length);
        const parts = sentences(lines);
        expect(parts.length).toBeGreaterThanOrEqual(3);
        expect(new Set(parts).size).toBe(parts.length);
      }
    });
  }
}

// --- 4. an unread list is still not reported as a confirmed absence -------

test("an unreadable magpie list is never described as a confirmed omission", () => {
  const card = pluginOnlyCard(undefined, METHODS[2].methods);
  expect(card.description.en).toBe("Found in an installed magpie plugin. Its sign-in methods are listed below.");
  expect(card.notice.en).toContain("was not readable");
  expect(card.notice.en).not.toContain("does not include it");
  expect(card.description.en).not.toContain("not readable");
  // A method the scan cannot classify is described as declared, not as missing.
  expect(card.capability.reason.en).toContain("shown exactly as declared");
  expect(card.capability.reason.en).not.toMatch(/not verified|unverified/i);
});

test("a readable magpie list may say the provider is not in it", () => {
  const card = pluginOnlyCard(["codex"], METHODS[2].methods);
  expect(card.notice.en).toContain("does not include it");
  expect(card.notice.en).not.toContain("was not readable");
  expect(card.description.en).toBe("Found in an installed magpie plugin. Its sign-in methods are listed below.");
});
