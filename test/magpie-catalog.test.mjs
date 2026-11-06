import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MARKET_FILE,
  MAX_CATALOG_PROVIDERS,
  STATE_FILE,
  magpieCacheDir,
  readMarketCatalog,
  readProviderState,
  titleFromId,
} from "../lib/magpie-catalog.mjs";

function cacheDir() {
  return mkdtempSync(join(tmpdir(), "clean-login-catalog-"));
}

function writeCache(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value));
}

describe("magpieCacheDir", () => {
  test("an explicit override wins", () => {
    expect(magpieCacheDir({ MAGPIE_CACHE_DIR: "C:/tmp/cache" })).toBe("C:/tmp/cache");
  });

  test("XDG_CACHE_HOME is honoured", () => {
    expect(magpieCacheDir({ XDG_CACHE_HOME: "/home/u/.cache" })).toBe(join("/home/u/.cache", "magpie"));
  });

  test("the default is ~/.cache/magpie", () => {
    expect(magpieCacheDir({ USERPROFILE: "C:/Users/x" })).toBe(join("C:/Users/x", ".cache", "magpie"));
  });
});

describe("readProviderState", () => {
  test("a missing file is unavailable, not empty", () => {
    const state = readProviderState({ MAGPIE_CACHE_DIR: cacheDir() });
    expect(state.available).toBe(false);
    expect(state.providers).toEqual([]);
  });

  test("a broken file is unavailable", () => {
    const dir = cacheDir();
    writeCache(dir, STATE_FILE, "{ not json");
    expect(readProviderState({ MAGPIE_CACHE_DIR: dir }).available).toBe(false);
  });

  test("the configured providers come back with their display names", () => {
    const dir = cacheDir();
    writeCache(dir, STATE_FILE, {
      version: "0.1.3123",
      providers: {
        providers: [
          { id: "antigravity", name: "Antigravity" },
          { id: "workbuddy-ai", name: "WorkBuddy AI" },
          { id: "antigravity", name: "duplicate" },
          { id: "", name: "nameless" },
        ],
      },
    });
    const state = readProviderState({ MAGPIE_CACHE_DIR: dir });
    expect(state.available).toBe(true);
    expect(state.count).toBe(2);
    expect(state.providers).toEqual([
      { id: "antigravity", name: "Antigravity" },
      { id: "workbuddy-ai", name: "WorkBuddy AI" },
    ]);
  });
});

describe("readMarketCatalog", () => {
  test("a missing market file is unavailable", () => {
    const catalog = readMarketCatalog({ MAGPIE_CACHE_DIR: cacheDir() });
    expect(catalog.available).toBe(false);
    expect(catalog.providers).toEqual([]);
  });

  test("plugins without providers are skipped and providers are deduped", () => {
    const dir = cacheDir();
    writeCache(dir, MARKET_FILE, {
      version: 1,
      plugins: [
        { package: "@magpie-community/a", name: "A", providers: ["alpha", "beta"] },
        { package: "@magpie-community/b", name: "B", providers: ["beta", "gamma"] },
        { package: "@magpie-community/c", name: "C", providers: [] },
        { package: "@magpie-community/d", name: "D" },
        { package: "@magpie-community/e", name: "E", providers: ["delta"] },
      ],
    });
    const catalog = readMarketCatalog({ MAGPIE_CACHE_DIR: dir });
    expect(catalog.available).toBe(true);
    expect(catalog.count).toBe(3);
    expect(catalog.providers.map((item) => item.id)).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(catalog.providers[0]).toEqual({
      id: "alpha",
      name: "Alpha",
      pluginName: "A",
      package: "@magpie-community/a",
    });
  });

  test("a name map upgrades ids to the names this machine already uses", () => {
    const dir = cacheDir();
    writeCache(dir, MARKET_FILE, {
      plugins: [{ package: "p", name: "P", providers: ["workbuddy-ai"] }],
    });
    const names = new Map([["workbuddy-ai", "WorkBuddy AI"]]);
    const catalog = readMarketCatalog({ MAGPIE_CACHE_DIR: dir }, { names });
    expect(catalog.providers[0].name).toBe("WorkBuddy AI");
  });

  test("the provider count is capped so a corrupt file cannot flood the page", () => {
    const dir = cacheDir();
    const providers = Array.from({ length: MAX_CATALOG_PROVIDERS + 25 }, (_, i) => `p${i}`);
    writeCache(dir, MARKET_FILE, { plugins: [{ package: "p", name: "P", providers }] });
    const catalog = readMarketCatalog({ MAGPIE_CACHE_DIR: dir });
    expect(catalog.providers).toHaveLength(MAX_CATALOG_PROVIDERS);
  });

  test("a plugin name is required, so a nameless entry is skipped", () => {
    const dir = cacheDir();
    writeCache(dir, MARKET_FILE, { plugins: [{ providers: ["orphan"] }] });
    const catalog = readMarketCatalog({ MAGPIE_CACHE_DIR: dir });
    expect(catalog.available).toBe(true);
    expect(catalog.count).toBe(0);
    expect(catalog.providers).toEqual([]);
  });
});

describe("titleFromId", () => {
  test("a hyphenated id becomes a readable label", () => {
    expect(titleFromId("opencode-zen-free")).toBe("Opencode Zen Free");
    expect(titleFromId("github-copilot")).toBe("Github Copilot");
  });

  test("an empty or junk id yields an empty label", () => {
    expect(titleFromId("")).toBe("");
    expect(titleFromId("   ")).toBe("");
    expect(titleFromId(null)).toBe("");
  });
});
