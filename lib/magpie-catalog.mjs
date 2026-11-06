import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// magpie keeps two machine-readable catalogues next to its cache, and both
// change whenever magpie updates or the user installs something:
//
//   <cache>/plugin-market.json    every plugin magpie offers, with the provider
//                                 ids each one declares (`providers`). This is
//                                 the list a user sees in magpie's own market,
//                                 so it is also the list of providers they may
//                                 reasonably expect to find here.
//   <cache>/providers-state.json  the providers this machine has configured,
//                                 built-in ones included. Names live here.
//
// Reading them is the whole point of "scan the user's magpie": nothing below
// is hardcoded, so a provider magpie adds tomorrow shows up without a release.
// A missing or broken file costs catalogue cards, never the page.

export const MARKET_FILE = "plugin-market.json";
export const STATE_FILE = "providers-state.json";

// A catalogue entry is a provider id plus the plugin that declares it. The cap
// exists so a corrupt file cannot turn into thousands of DOM nodes.
export const MAX_CATALOG_PROVIDERS = 200;
export const MAX_NAME_CHARS = 120;
export const MAX_PACKAGE_CHARS = 160;

export function magpieCacheDir(env = process.env) {
  const explicit = env.MAGPIE_CACHE_DIR;
  if (typeof explicit === "string" && explicit) return explicit;
  const xdg = env.XDG_CACHE_HOME;
  if (typeof xdg === "string" && xdg) return join(xdg, "magpie");
  const home = env.USERPROFILE || env.HOME || homedir();
  return join(home, ".cache", "magpie");
}

function readJson(file) {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function text(value, max = MAX_NAME_CHARS) {
  if (typeof value !== "string") return "";
  const flat = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return flat.slice(0, max);
}

// A provider id is all the market gives for a plugin that is not installed, and
// `opencode-zen-free` reads like a variable, not a product. Title-casing the id
// is the only transformation here: no name is invented and no provider is
// hardcoded, so a provider magpie adds later still gets a readable label.
export function titleFromId(id) {
  const value = text(id);
  if (!value) return "";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, MAX_NAME_CHARS);
}

// The configured providers, id plus display name. `providers-state.json`
// nests the list one level down (`providers.providers`); anything else is a
// shape this version does not know and is reported as unavailable rather than
// guessed at.
export function readProviderState(env = process.env) {
  const doc = readJson(join(magpieCacheDir(env), STATE_FILE));
  const rows = doc && doc.providers && Array.isArray(doc.providers.providers)
    ? doc.providers.providers
    : null;
  if (!rows) return { available: false, count: 0, providers: [] };
  const providers = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = text(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    providers.push({ id, name: text(row.name) || id });
  }
  return { available: true, count: providers.length, providers };
}

// Every provider id magpie's market declares, paired with the plugin that
// declares it. `names` maps id to the display name this machine already uses,
// so a catalogue card reads "WorkBuddy AI" rather than "workbuddy-ai".
export function readMarketCatalog(env = process.env, { names } = {}) {
  const doc = readJson(join(magpieCacheDir(env), MARKET_FILE));
  const rows = doc && Array.isArray(doc.plugins) ? doc.plugins : null;
  if (!rows) return { available: false, count: 0, plugins: [], providers: [] };
  const lookup = names instanceof Map ? names : new Map();
  const plugins = [];
  const providers = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const ids = Array.isArray(row.providers)
      ? row.providers.map((id) => text(id)).filter(Boolean)
      : [];
    if (!ids.length) continue;
    const pluginName = text(row.name) || text(row.package, MAX_PACKAGE_CHARS);
    const pkg = text(row.package, MAX_PACKAGE_CHARS);
    if (!pluginName) continue;
    plugins.push({ package: pkg, name: pluginName, providers: ids.slice() });
    for (const id of ids) {
      if (seen.has(id) || providers.length >= MAX_CATALOG_PROVIDERS) continue;
      seen.add(id);
      providers.push({
        id,
        name: text(lookup.get(id)) || titleFromId(id),
        pluginName,
        package: pkg,
      });
    }
  }
  return { available: true, count: plugins.length, plugins, providers };
}
