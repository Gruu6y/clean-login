import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("uses the community page package shape", () => {
  expect(pkg.name).toBe("@gruu6y/page-clean-login");
  expect(pkg.license).toBe("MIT");
  expect(pkg.type).toBe("module");
  expect(pkg.main).toBe("./index.mjs");
  expect(pkg.magpie.page.file).toBe("page/index.html");
  expect(pkg.magpie.page.service).toEqual({ port: 3492, option: "port" });
  expect(pkg.magpie.options.port).toBe(3492);
});

test("declares only the providers:list read it actually uses", () => {
  expect(pkg.magpie.permissions).toEqual(["providers:list"]);
});

test("ships every file the manifest names", () => {
  for (const file of [
    pkg.main,
    pkg.magpie.page.file,
    pkg.magpie.page.icon,
    "ui/index.html",
    "ui/style.css",
    "ui/app.js",
    "README.md",
    "LICENSE",
  ]) {
    expect(existsSync(join(root, file))).toBe(true);
  }
});

// A standalone repository has no community registry.json above it. The topic
// install channel instead requires the manifest to carry its own identity:
// an MIT license and a repository/bugs URL that point at this repository.
test("declares a standalone repository the topic channel can find", () => {
  expect(pkg.license).toBe("MIT");
  expect(pkg.repository.type).toBe("git");
  expect(pkg.repository.url).toBe("git+https://github.com/Gruu6y/clean-login.git");
  expect(pkg.bugs.url).toBe("https://github.com/Gruu6y/clean-login/issues");
  expect(pkg.keywords).toContain("magpie-plugin");
});

test("never hand the model directory to the host through the inert name", () => {
  // fpgen-js reads FPGEN_DATA_DIR. The old code wrote CAMOUFOX_FPGEN_DATA and
  // claimed the forked host read it back; that handoff is not the fix anymore.
  for (const name of readdirSync(join(root, "lib"))) {
    if (!name.endsWith(".mjs")) continue;
    const text = readFileSync(join(root, "lib", name), "utf8");
    expect(text.includes("CAMOUFOX_FPGEN_DATA")).toBe(false);
  }
});
