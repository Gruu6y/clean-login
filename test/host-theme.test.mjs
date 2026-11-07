import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { followHostTheme, themeFromHostMessage } from "../ui/host-theme.js";

const root = join(import.meta.dir, "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const app = read("ui/app.js");
const boot = read("page/boot.js");

// The message magpie actually posts, copied from the host's pluginpage bridge:
//   function post(win, msg) { win?.postMessage({ magpie: 1, ...msg }, "*"); }
//   function pushTheme() { ... post(p.frame?.contentWindow, { event: "theme", data }) }
function hostMessage(dark, extra = {}) {
  return { magpie: 1, event: "theme", data: { dark, lang: "en", tokens: { bg: "#000" }, ...extra } };
}

function fakeWindow({ parent } = {}) {
  const listeners = [];
  const win = {
    parent,
    addEventListener(type, fn) {
      if (type === "message") listeners.push(fn);
    },
    removeEventListener(type, fn) {
      const at = listeners.indexOf(fn);
      if (type === "message" && at >= 0) listeners.splice(at, 1);
    },
    deliver(event) {
      for (const fn of [...listeners]) fn(event);
    },
    get listening() {
      return listeners.length;
    },
  };
  return win;
}

function fakeDocument() {
  return { documentElement: { dataset: {} } };
}

describe("following magpie's theme switch", () => {
  test("the host's theme message is understood in both directions", () => {
    expect(themeFromHostMessage({ source: "host", data: hostMessage(true) }, "host")).toBe("dark");
    expect(themeFromHostMessage({ source: "host", data: hostMessage(false) }, "host")).toBe("light");
  });

  test("only the host frame can move the theme", () => {
    // A theme message that did not come from the frame we are mounted in is not
    // the host, whatever it claims.
    expect(themeFromHostMessage({ source: "elsewhere", data: hostMessage(true) }, "host")).toBeNull();
    expect(themeFromHostMessage({ source: null, data: hostMessage(true) }, "host")).toBeNull();
    // A top-level visit has no host at all; nothing should claim to be one.
    expect(themeFromHostMessage({ source: null, data: hostMessage(true) }, null)).toBeNull();
  });

  test("other traffic from the host is left alone", () => {
    const parent = "host";
    expect(themeFromHostMessage({ source: parent, data: { magpie: 1, event: "options", data: {} } }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: { event: "theme", data: { dark: true } } }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: { magpie: 2, event: "theme", data: { dark: true } } }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: hostMessage("dark") }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: hostMessage(undefined) }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: null }, parent)).toBeNull();
    expect(themeFromHostMessage({ source: parent, data: "theme" }, parent)).toBeNull();
    expect(themeFromHostMessage(null, parent)).toBeNull();
  });

  test("a live switch repaints the page and the listener can be dropped", () => {
    const parent = fakeWindow();
    const win = fakeWindow({ parent });
    const doc = fakeDocument();

    const stop = followHostTheme({ window: win, document: doc });
    expect(win.listening).toBe(1);
    expect(doc.documentElement.dataset.theme).toBeUndefined();

    win.deliver({ source: parent, data: hostMessage(true) });
    expect(doc.documentElement.dataset.theme).toBe("dark");

    win.deliver({ source: parent, data: hostMessage(false) });
    expect(doc.documentElement.dataset.theme).toBe("light");

    // Anything else arriving on the same channel changes nothing.
    win.deliver({ source: parent, data: { magpie: 1, event: "theme", data: { lang: "ja" } } });
    win.deliver({ source: "elsewhere", data: hostMessage(true) });
    expect(doc.documentElement.dataset.theme).toBe("light");

    stop();
    expect(win.listening).toBe(0);
    win.deliver({ source: parent, data: hostMessage(true) });
    expect(doc.documentElement.dataset.theme).toBe("light");
  });

  test("a window without a document is not fatal", () => {
    expect(() => followHostTheme({ window: fakeWindow(), document: null })()).not.toThrow();
    expect(() => followHostTheme({ window: null, document: fakeDocument() })()).not.toThrow();
  });

  test("the page actually subscribes, and keeps its own palette", () => {
    // The regression this guards: the launcher frame reads the theme once and
    // navigates away, so nothing listened for the host's later pushes and the
    // plugin kept its opening colour until it was reopened.
    expect(app).toContain('import { followHostTheme } from "./host-theme.js";');
    expect(app).toContain("followHostTheme();");
    expect(app).toContain('const theme = query.get("theme");');

    // magpie also sends its own palette tokens; taking them would make the two
    // designs fight, so only the light/dark bit is read.
    const module = read("ui/host-theme.js");
    expect(module).not.toContain("--magpie-");
    expect(module).not.toContain("style.setProperty");
    expect(module).toContain('message[HOST_MESSAGE_FLAG] !== 1');
    expect(module).toContain("event.source !== parent");

    // The launcher frame still carries the opening theme in the URL.
    expect(boot).toContain('target.searchParams.set("theme", theme)');
  });
});
