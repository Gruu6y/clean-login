// Pure client-side filtering for the Proxy IPs table: the distinct-region
// counts, the multi-select plus latency range, and the read-file wiring of the
// filter bar. No DOM is needed.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  distinctRegions,
  filterProxies,
  latencyBound,
  regionKey,
} from "../ui/proxy-filter.js";

const root = join(import.meta.dir, "..");
const app = readFileSync(join(root, "ui", "app.js"), "utf8");
const html = readFileSync(join(root, "ui", "index.html"), "utf8");

const proxies = [
  { id: "a", region: "中国/香港", latency: 120 },
  { id: "b", region: "日本/东京", latency: 45 },
  { id: "c", region: "中国/香港", latency: 260 },
  { id: "d", region: "", latency: null },
  { id: "e", region: "  ", latency: 90 },
  { id: "f", region: "日本/东京", latency: 45 },
];

test("distinctRegions counts each region and keeps untested apart and last", () => {
  expect(distinctRegions(proxies)).toEqual([
    { region: "中国/香港", count: 2 },
    { region: "日本/东京", count: 2 },
    { region: "", count: 2 },
  ]);
  // An absent or malformed list degrades to no regions instead of throwing.
  expect(distinctRegions()).toEqual([]);
  expect(distinctRegions([null, undefined, {}])).toEqual([{ region: "", count: 1 }]);
});

test("regionKey trims and tolerates missing regions", () => {
  expect(regionKey({ region: "  Japan  " })).toBe("Japan");
  expect(regionKey({ region: "" })).toBe("");
  expect(regionKey({})).toBe("");
  expect(regionKey()).toBe("");
});

test("filterProxies with no filter returns every proxy", () => {
  expect(filterProxies(proxies)).toEqual(proxies);
  expect(filterProxies(proxies, { regions: [], minLatency: "", maxLatency: "" })).toEqual(proxies);
});

test("regions are a multi-select and the untested region can stand alone", () => {
  const hongKong = filterProxies(proxies, { regions: ["中国/香港"] }).map((p) => p.id);
  expect(hongKong).toEqual(["a", "c"]);
  const both = filterProxies(proxies, { regions: ["中国/香港", "日本/东京"] }).map((p) => p.id);
  expect(both).toEqual(["a", "b", "c", "f"]);
  // Empty string selects only rows that have never been tested (region "").
  expect(filterProxies(proxies, { regions: [""] }).map((p) => p.id)).toEqual(["d", "e"]);
});

test("latency bounds apply only to numeric latencies and exclude null rows", () => {
  expect(filterProxies(proxies, { minLatency: 100 }).map((p) => p.id)).toEqual(["a", "c"]);
  expect(filterProxies(proxies, { maxLatency: 100 }).map((p) => p.id)).toEqual(["b", "e", "f"]);
  expect(filterProxies(proxies, { minLatency: 45, maxLatency: 120 }).map((p) => p.id)).toEqual(["a", "b", "e", "f"]);
  // A single bound still excludes the unknown-latency row.
  expect(filterProxies(proxies, { minLatency: 0 }).map((p) => p.id)).toEqual(["a", "b", "c", "e", "f"]);
});

test("region and latency filters combine", () => {
  const result = filterProxies(proxies, {
    regions: ["日本/东京"],
    minLatency: 50,
    maxLatency: 200,
  });
  expect(result.map((p) => p.id)).toEqual([]);
});

test("latencyBound ignores empty and nonsense input", () => {
  expect(latencyBound("")).toBeNull();
  expect(latencyBound("   ")).toBeNull();
  expect(latencyBound(null)).toBeNull();
  expect(latencyBound(undefined)).toBeNull();
  expect(latencyBound("abc")).toBeNull();
  expect(latencyBound(0)).toBe(0);
  expect(latencyBound("120")).toBe(120);
  expect(latencyBound(45.5)).toBe(45.5);
});

test("the filter bar is wired to the pure helpers and every chip is a button", () => {
  expect(app).toContain("filterProxies(proxies, proxyFilter)");
  expect(app).toContain("distinctRegions(proxies)");
  expect(app).toContain("function renderFilterChips()");
  expect(app).toContain("function resetProxyFilters()");
  expect(app).toContain('all.type = "button"');
  expect(app).toContain('chip.type = "button"');
  expect(html).toContain('id="proxy-filters"');
  expect(html).toContain('id="filter-regions"');
  expect(html).toContain('id="filter-latency-min"');
  expect(html).toContain('id="filter-latency-max"');
  expect(html).toContain('id="filter-reset"');
  expect(html).toContain('id="filter-count"');
  expect(html).toContain('id="filter-reset" type="button"');

  const filterBar = /<div class="proxy-filters"[\s\S]*?<\/div>\n        <div class="proxy-score-bar"/.exec(html)?.[0] || "";
  expect(filterBar).toContain("filter-latency-min");
  expect(filterBar).not.toContain('type="submit"');
});

test("the table shows a filtered count and an explicit no-match note", () => {
  expect(app).toContain("text.filterCount");
  expect(app).toContain("text.filterNoMatch");
  expect(app).toContain('byId("filter-count").textContent');
});

test("filter state is in memory, never localStorage", () => {
  expect(app).not.toContain("localStorage");
  expect(app).not.toContain("sessionStorage");
  expect(app).toContain('regions: new Set()');
});
