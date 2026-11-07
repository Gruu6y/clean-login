// The card chrome — provider name, origin tag, method chip and its tag — has
// broken three times in a row in the narrow four-column grid: names cut to
// "QwenWo…", origin tags split onto two lines, and a method tag crushed to 35px
// so "需要填表" stacked as "需要"/"填表" next to a wrapped label. These are pure
// CSS facts, so they are pinned here rather than in a browser run.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const style = readFileSync(join(root, "ui", "style.css"), "utf8").replaceAll("\r\n", "\n");

function ruleBody(selector) {
  const start = style.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const end = style.indexOf("}", start);
  return style.slice(start + selector.length + 2, end);
}

test("a provider name is never cut to an ellipsis", () => {
  const body = ruleBody(".provider-name");
  // The name is the only thing telling two same-vendor cards apart, so it wraps
  // instead of turning into "MiniMax Code (Gl…".
  expect(body).not.toContain("text-overflow: ellipsis");
  expect(body).not.toContain("white-space: nowrap");
  expect(body).toContain("overflow-wrap: anywhere");
  expect(body).toContain("min-width: 0");
});

test("the head row wraps so the name keeps the width it needs", () => {
  const body = ruleBody(".provider-head");
  // With the tag pinned on the same line the name only ever gets ~82px, which
  // breaks "WorkBuddy" mid-word. Wrapping moves the tag to its own row instead.
  expect(body).toContain("flex-wrap: wrap");
});

test("an origin tag stays on one line and keeps its place on the right", () => {
  const body = ruleBody(".provider-origin");
  expect(body).toContain("flex: 0 0 auto");
  expect(body).toContain("margin-left: auto");
});

test("a method chip wraps its tag instead of squeezing it", () => {
  const chip = ruleBody(".provider-method");
  expect(chip).toContain("flex-wrap: wrap");
  expect(chip).toContain("max-width: 100%");
  // line-height 1 stacked a two-line label into an unreadable block.
  expect(chip).toContain("9.5px/1.3");
});

test("a method tag is never split across lines", () => {
  const body = ruleBody(".provider-method-tag");
  expect(body).toContain("flex: 0 0 auto");
  expect(body).toContain("white-space: nowrap");
});
