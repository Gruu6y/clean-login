// The login browser launcher. No browser is started: the option builder and
// the preflight checks are exercised directly, and the in-process launch path
// is driven through injected camoufox/playwright stubs.
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ScoreBrowserError,
  SignInBrowserError,
  buildLaunchInput,
  launchScoreBrowser,
  launchSignInBrowser,
  openSignInBrowser,
  toPlaywrightProxy,
} from "../lib/browser-launcher.mjs";

const tempDirs = [];

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "clean-login-launcher-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("the launch input pins the persistent profile and the fingerprint", () => {
  const identity = { webgl: { vendor: "X" } };
  const input = buildLaunchInput({ url: "https://x/signin", profileDir: "/profiles/a", identity });
  expect(input.url).toBe("https://x/signin");
  expect(input.launch.persistent_context).toBe(true);
  expect(input.launch.user_data_dir).toBe("/profiles/a");
  expect(input.launch.fingerprint).toBe(identity);
  expect(input.launch.canvas_noise).toBe(false);
  // No proxy means no proxy and no geoip lookup.
  expect("proxy" in input.launch).toBe(false);
  expect("geoip" in input.launch).toBe(false);
  // No model directory is invented when the caller did not name one.
  expect(input.modelDir).toBeNull();
});

test("the launch input carries the plugin's own fpgen model directory", () => {
  const modelDir = "/plugin/camoufox/fpgen";
  const input = buildLaunchInput({
    url: "https://x/signin",
    profileDir: "/profiles/a",
    identity: {},
    modelDir,
  });
  expect(input.modelDir).toBe(modelDir);
  // The directory is input data, not a camoufox launch option.
  expect("modelDir" in input.launch).toBe(false);
});

test("a proxy is normalized and turns geoip on", () => {
  const input = buildLaunchInput({
    url: "https://x/signin",
    profileDir: "/profiles/a",
    identity: {},
    proxy: { type: "socks5", host: "127.0.0.1", port: 1080, username: "u", password: "p" },
  });
  expect(input.launch.proxy).toEqual({
    server: "socks5://127.0.0.1:1080",
    username: "u",
    password: "p",
  });
  expect(input.launch.geoip).toBe(true);
});

test("toPlaywrightProxy accepts both a stored record and a server string", () => {
  expect(toPlaywrightProxy({ server: "http://h:1", username: "u" })).toEqual({
    server: "http://h:1",
    username: "u",
  });
  expect(toPlaywrightProxy({ type: "http", host: "h", port: 8080 })).toEqual({
    server: "http://h:8080",
  });
  expect(toPlaywrightProxy({ type: "https", host: "h", port: 443 })).toEqual({
    server: "https://h:443",
  });
  expect(toPlaywrightProxy(null)).toBeNull();
  expect(toPlaywrightProxy({ type: "http", host: "", port: 1 })).toBeNull();
});

test("openSignInBrowser passes the pin and the profile to camoufox", async () => {
  const dir = await tempDir();
  const profileDir = join(dir, "profile");
  const identity = { tag: "pin" };
  const calls = { goto: null };
  const context = {
    pages: () => [{ goto: async (url) => { calls.goto = url; } }],
    on: () => {},
    close: async () => {},
  };
  const camoufox = {
    async launchOptions(options) {
      calls.launchOptions = options;
      return { executablePath: options.executable_path, user_data_dir: "overridden" };
    },
    async NewBrowser(_playwright, options) {
      calls.newBrowser = options;
      return context;
    },
  };
  await openSignInBrowser({
    executablePath: join(dir, "camoufox.exe"),
    url: "https://x/signin",
    profileDir,
    identity,
    deps: {
      checkExecutable: async () => true,
      loadCamoufox: async () => camoufox,
      loadPlaywright: async () => ({ firefox: {} }),
    },
  });
  expect(calls.launchOptions.fingerprint).toBe(identity);
  expect(calls.launchOptions.canvas_noise).toBe(false);
  expect(calls.launchOptions.executable_path).toBe(join(dir, "camoufox.exe"));
  expect(calls.newBrowser.persistent_context).toBe(true);
  expect(calls.newBrowser.from_options.user_data_dir).toBe(profileDir);
  expect(calls.goto).toBe("https://x/signin");
});

test("openSignInBrowser points fpgen at the plugin model after importing camoufox", async () => {
  const dir = await tempDir();
  const modelDir = join(dir, "camoufox", "fpgen");
  const order = [];
  const setModelDir = [];
  const camoufox = {
    async launchOptions() {
      return {};
    },
    async NewBrowser() {
      return { pages: () => [{ goto: async () => {} }], close: async () => {} };
    },
  };
  await openSignInBrowser({
    executablePath: join(dir, "camoufox.exe"),
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    identity: {},
    modelDir,
    deps: {
      checkExecutable: async () => true,
      loadCamoufox: async () => {
        order.push("camoufox");
        return camoufox;
      },
      loadFpgen: async () => {
        order.push("fpgen");
        return { setModelDir: (value) => setModelDir.push(value) };
      },
      loadPlaywright: async () => ({ firefox: {} }),
    },
  });
  // camoufox is imported first, because its own import is what overwrites the
  // configured model directory; fpgen is re-pointed only afterwards.
  expect(order).toEqual(["camoufox", "fpgen"]);
  expect(setModelDir).toEqual([modelDir]);
});

test("openSignInBrowser leaves fpgen alone when no model directory is given", async () => {
  const dir = await tempDir();
  let fpgenLoaded = false;
  const camoufox = {
    async launchOptions() {
      return {};
    },
    async NewBrowser() {
      return { pages: () => [{ goto: async () => {} }], close: async () => {} };
    },
  };
  await openSignInBrowser({
    executablePath: join(dir, "camoufox.exe"),
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    identity: {},
    deps: {
      checkExecutable: async () => true,
      loadCamoufox: async () => camoufox,
      loadFpgen: async () => {
        fpgenLoaded = true;
        return { setModelDir() {} };
      },
      loadPlaywright: async () => ({ firefox: {} }),
    },
  });
  expect(fpgenLoaded).toBe(false);
});

test("openSignInBrowser carries the proxy and geoip through", async () => {
  const dir = await tempDir();
  const calls = {};
  const camoufox = {
    async launchOptions(options) {
      calls.launchOptions = options;
      return {};
    },
    async NewBrowser() {
      return { pages: () => [{ goto: async () => {} }], close: async () => {} };
    },
  };
  await openSignInBrowser({
    executablePath: join(dir, "camoufox.exe"),
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    identity: {},
    proxy: { server: "http://p:1" },
    deps: {
      checkExecutable: async () => true,
      loadCamoufox: async () => camoufox,
      loadPlaywright: async () => ({ firefox: {} }),
    },
  });
  expect(calls.launchOptions.proxy).toEqual({ server: "http://p:1" });
  expect(calls.launchOptions.geoip).toBe(true);
});

test("launchSignInBrowser refuses a missing URL before anything else", async () => {
  await expect(launchSignInBrowser({ executablePath: "/x", url: "", profileDir: "/p" })).rejects.toMatchObject({
    code: "url_missing",
  });
});

test("launchSignInBrowser reports a missing executable honestly", async () => {
  const dir = await tempDir();
  let error;
  try {
    await launchSignInBrowser({
      executablePath: join(dir, "does-not-exist.exe"),
      url: "https://x/signin",
      profileDir: join(dir, "profile"),
      deps: { checkExecutable: async () => false, fork: () => {
        throw new Error("must not fork");
      } },
    });
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(SignInBrowserError);
  expect(error.code).toBe("executable_missing");
  expect(error.status).toBe(503);
});

test("launchSignInBrowser reports an unset executable path", async () => {
  await expect(
    launchSignInBrowser({ executablePath: null, url: "https://x/signin", profileDir: "/p" }),
  ).rejects.toMatchObject({ code: "executable_missing" });
});

test("launchSignInBrowser starts a host and returns its pid", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 4242;
  child.kill = () => {};
  child.send = () => queueMicrotask(() => child.emit("exit", 0));
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const handle = await launchSignInBrowser({
    executablePath: exe,
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    deps: {
      fork: () => {
        queueMicrotask(() => child.emit("message", { type: "ready", pid: 4242 }));
        return child;
      },
    },
  });
  expect(handle.pid).toBe(4242);
  await handle.close();
});

test("launchSignInBrowser passes the plugin model directory to the host", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const modelDir = join(dir, "camoufox", "fpgen");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 7;
  child.kill = () => {};
  child.send = () => queueMicrotask(() => child.emit("exit", 0));
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const captured = {};
  const handle = await launchSignInBrowser({
    executablePath: exe,
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    modelDir,
    env: {},
    deps: {
      fork: (hostPath, args, options) => {
        captured.hostPath = hostPath;
        captured.args = args;
        captured.env = options.env;
        queueMicrotask(async () => {
          captured.payload = JSON.parse(await readFile(args[0], "utf8"));
          child.emit("message", { type: "ready", pid: 7 });
        });
        return child;
      },
    },
  });
  expect(captured.payload.modelDir).toBe(modelDir);
  // FPGEN_DATA_DIR is the real name fpgen-js reads; the shared camoufox cache
  // path is never what the host is pointed at.
  expect(captured.env.FPGEN_DATA_DIR).toBe(modelDir);
  await handle.close();
});

test("launchSignInBrowser defaults to the plugin's model directory", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const root = join(dir, "browser-root");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 8;
  child.kill = () => {};
  child.send = () => queueMicrotask(() => child.emit("exit", 0));
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const captured = {};
  const handle = await launchSignInBrowser({
    executablePath: exe,
    url: "https://x/signin",
    profileDir: join(dir, "profile"),
    env: { MAGPIE_CLEAN_LOGIN_BROWSER_DIR: root },
    deps: {
      fork: (_hostPath, args, options) => {
        captured.env = options.env;
        queueMicrotask(async () => {
          captured.payload = JSON.parse(await readFile(args[0], "utf8"));
          child.emit("message", { type: "ready", pid: 8 });
        });
        return child;
      },
    },
  });
  expect(captured.payload.modelDir).toBe(join(root, "fpgen"));
  expect(captured.env.FPGEN_DATA_DIR).toBe(join(root, "fpgen"));
  await handle.close();
});

// ---------- the scoring launcher ----------

test("openSignInBrowser also hands back the page it opened", async () => {
  const dir = await tempDir();
  const page = { goto: async () => {} };
  const context = { pages: () => [page], on: () => {}, close: async () => {} };
  const camoufox = {
    async launchOptions() {
      return {};
    },
    async NewBrowser() {
      return context;
    },
  };
  const handle = await openSignInBrowser({
    executablePath: join(dir, "camoufox.exe"),
    url: "https://ip.net.coffee/claude/",
    profileDir: join(dir, "profile"),
    identity: {},
    deps: {
      checkExecutable: async () => true,
      loadCamoufox: async () => camoufox,
      loadPlaywright: async () => ({ firefox: {} }),
    },
  });
  expect(handle.page).toBe(page);
});

test("launchScoreBrowser reports the score the host sends", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 11;
  child.kill = () => {};
  child.send = () => queueMicrotask(() => child.emit("exit", 0));
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const handle = await launchScoreBrowser({
    executablePath: exe,
    url: "https://ip.net.coffee/claude/",
    profileDir: join(dir, "profile"),
    identity: { tag: "pin" },
    proxy: { type: "http", host: "h", port: 8080 },
    deps: {
      fork: () => {
        queueMicrotask(() => {
          child.emit("message", { type: "ready", pid: 11 });
          child.emit("message", { type: "score", score: 92, label: "优异", ip: "203.0.113.7" });
        });
        return child;
      },
    },
  });
  expect(handle.pid).toBe(11);
  expect(await handle.result).toEqual({ score: 92, label: "优异", ip: "203.0.113.7" });
  await handle.close();
});

test("launchScoreBrowser turns a host error into its own code", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 12;
  child.kill = () => {};
  child.send = () => {};
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const handle = await launchScoreBrowser({
    executablePath: exe,
    url: "https://ip.net.coffee/claude/",
    profileDir: join(dir, "profile"),
    identity: {},
    deps: {
      fork: () => {
        queueMicrotask(() => {
          child.emit("message", { type: "ready", pid: 12 });
          child.emit("message", { type: "error", code: "page_timeout", message: "no score" });
        });
        return child;
      },
    },
  });
  await expect(handle.result).rejects.toBeInstanceOf(ScoreBrowserError);
  await expect(handle.result).rejects.toMatchObject({ code: "page_timeout" });
});

test("launchScoreBrowser turns an error before the window opens into a launch failure", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 14;
  child.kill = () => {};
  child.send = () => {};
  child.unref = () => {};
  child.channel = { unref: () => {} };
  await expect(
    launchScoreBrowser({
      executablePath: exe,
      url: "https://ip.net.coffee/claude/",
      profileDir: join(dir, "profile"),
      identity: {},
      deps: {
        fork: () => {
          queueMicrotask(() =>
            child.emit("message", { type: "error", code: "launch_failed", message: "no browser" }),
          );
          return child;
        },
      },
    }),
  ).rejects.toMatchObject({ code: "launch_failed" });
});

test("launchScoreBrowser refuses a missing executable before forking", async () => {
  const dir = await tempDir();
  await expect(
    launchScoreBrowser({
      executablePath: join(dir, "does-not-exist.exe"),
      url: "https://ip.net.coffee/claude/",
      profileDir: join(dir, "profile"),
      deps: {
        checkExecutable: async () => false,
        fork: () => {
          throw new Error("must not fork");
        },
      },
    }),
  ).rejects.toMatchObject({ code: "executable_missing" });
});

test("launchScoreBrowser times out when the host never opens the browser", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 13;
  child.kill = () => {};
  child.send = () => {};
  child.unref = () => {};
  child.channel = { unref: () => {} };
  await expect(
    launchScoreBrowser({
      executablePath: exe,
      url: "https://ip.net.coffee/claude/",
      profileDir: join(dir, "profile"),
      identity: {},
      launchTimeoutMs: 30,
      deps: { fork: () => child },
    }),
  ).rejects.toMatchObject({ code: "launch_timeout" });
});

test("launchScoreBrowser passes the page deadline to the host", async () => {
  const dir = await tempDir();
  const exe = join(dir, "camoufox.exe");
  await writeFile(exe, "exe");
  const { EventEmitter } = await import("node:events");
  const child = new EventEmitter();
  child.pid = 15;
  child.kill = () => {};
  child.send = () => queueMicrotask(() => child.emit("exit", 0));
  child.unref = () => {};
  child.channel = { unref: () => {} };
  const captured = {};
  const handle = await launchScoreBrowser({
    executablePath: exe,
    url: "https://ip.net.coffee/claude/",
    profileDir: join(dir, "profile"),
    identity: {},
    timeoutMs: 90_000,
    deps: {
      fork: (_hostPath, args) => {
        queueMicrotask(async () => {
          captured.payload = JSON.parse(await readFile(args[0], "utf8"));
          child.emit("message", { type: "ready", pid: 15 });
        });
        return child;
      },
    },
  });
  // The host polls the page, so it needs the page's own deadline.
  expect(captured.payload.timeoutMs).toBe(90_000);
  await handle.close();
});

