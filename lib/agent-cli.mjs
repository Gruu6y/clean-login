// The bundled command-line client for the Clean Login service.
//
// Why it exists: the service is an HTTP API behind a per-process token that is
// only ever written into the page it serves. A program driving it — an agent,
// a script — otherwise has to find the port, fetch the page, scrape the token
// out of the HTML, and then poll a long-running job with a fresh request per
// poll. This client discovers the port and token once, sends one request per
// step, and slices the compact `/api/agent` digest so only the requested
// section reaches stdout.
//
// It is deliberately dependency-free: the runtime's global `fetch` and nothing
// else, with no import from the service's own modules. That keeps startup in
// milliseconds and lets it run even when the heavy browser modules are not
// installed. It never prints the page token.

// Must match lib/server.mjs. A test asserts the two are equal, so a rename
// there fails here instead of silently.
export const TOKEN_HEADER = "x-clean-login-token";
export const TOKEN_META_NAME = "clean-login-token";
export const DEFAULT_PORT = 3492;
const DEFAULT_WAIT_MS = 60_000;

export class CliError extends Error {
  constructor(message, { code = "cli_error", status = 0 } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.status = status;
  }
}

// The token meta tag, read whichever way its attributes are ordered. A tag
// that is missing or malformed yields "" rather than a guess.
export function parseTokenFromHtml(html) {
  const text = String(html ?? "");
  const tag = new RegExp(`<meta\\b[^>]*name=["']${TOKEN_META_NAME}["'][^>]*>`, "i").exec(text);
  if (!tag) return "";
  const content = /content=["']([^"']*)["']/i.exec(tag[0]);
  return content ? content[1] : "";
}

// Whether a host is this computer. The page token may be read over plain HTTP
// only from loopback; a remote service (for example under `magpie web`) must
// be given the token explicitly.
export function isLoopbackHost(host) {
  const value = String(host ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  return (
    !value ||
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value === "::1" ||
    /^127\./.test(value)
  );
}

function addOption(options, key, value) {
  if (!key) return;
  if (key === "input") {
    // Repeatable: one `--input key=value` per answer.
    options.input = Array.isArray(options.input) ? [...options.input, value] : [value];
    return;
  }
  options[key] = value;
}

// A tiny, predictable argv reader: `--key value`, `--key=value`, `--flag` and
// positionals. No negation, no clustering; the surface is small enough that
// guessing would only hide mistakes.
export function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (typeof arg !== "string") continue;
    if (arg === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      addOption(options, body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && typeof next === "string" && !next.startsWith("--")) {
      addOption(options, body, next);
      index += 1;
    } else {
      addOption(options, body, true);
    }
  }
  return { positional, options };
}

// `--wait` may be bare (use the default bound) or a millisecond count. Absent
// means "return the current state immediately".
function waitMsOf(options, fallback = DEFAULT_WAIT_MS) {
  if (!Object.prototype.hasOwnProperty.call(options, "wait")) return 0;
  if (options.wait === true) return fallback;
  const value = Number(options.wait);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function waitQuery(options) {
  const wait = waitMsOf(options);
  return wait > 0 ? `?wait=${wait}` : "";
}

function collectInputs(raw) {
  const inputs = {};
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== "string") continue;
    const eq = entry.indexOf("=");
    if (eq <= 0) continue;
    const key = entry.slice(0, eq).trim();
    if (key) inputs[key] = entry.slice(eq + 1);
  }
  return inputs;
}

function required(value, flag) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new CliError(`${flag} is required.`, { code: "missing_argument" });
  return text;
}

function normalizeBase(value) {
  try {
    return new URL(value).href.replace(/\/$/, "");
  } catch {
    throw new CliError(`Not a usable service URL: ${value}`, { code: "bad_url" });
  }
}

export function resolveBase(options, env) {
  const explicit = options.url || env.CLEAN_LOGIN_URL || "";
  if (explicit) return normalizeBase(explicit);
  const port = Number(options.port || env.CLEAN_LOGIN_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new CliError(`Not a usable port: ${String(options.port ?? env.CLEAN_LOGIN_PORT)}`, {
      code: "bad_port",
    });
  }
  return `http://127.0.0.1:${port}`;
}

export async function resolveToken(base, options, fetchImpl) {
  if (typeof options.token === "string" && options.token) return options.token;
  const host = new URL(base).hostname;
  if (!isLoopbackHost(host)) {
    throw new CliError(
      `Refusing to read the page token from a non-loopback host (${host}); pass --token.`,
      { code: "token_required" },
    );
  }
  let response;
  try {
    response = await fetchImpl(new URL("/", base), { method: "GET" });
  } catch (error) {
    throw new CliError(
      `Could not reach the service at ${base}. Is magpie running with this plugin open? (${String(error?.message || error)})`,
      { code: "unreachable" },
    );
  }
  if (!response.ok) {
    throw new CliError(`The service did not serve its page (HTTP ${response.status}).`, {
      code: "no_page",
      status: response.status,
    });
  }
  const token = parseTokenFromHtml(await response.text());
  if (!token) throw new CliError("The service page did not carry a page token.", { code: "no_token" });
  return token;
}

async function call(fetchImpl, base, token, path, { method = "GET", body } = {}) {
  const headers = { [TOKEN_HEADER]: token };
  const init = { method, headers };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchImpl(new URL(path, base), init);
  } catch (error) {
    throw new CliError(`Could not reach the service at ${base} (${String(error?.message || error)}).`, {
      code: "unreachable",
    });
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new CliError(String(payload?.message || payload?.error || `HTTP ${response.status}`), {
      code: String(payload?.error || "http_error"),
      status: response.status,
    });
  }
  return payload;
}

export function usage() {
  return [
    "clean-login — drive the Clean Login service from the command line.",
    "",
    "Usage: clean-login <command> [args] [options]",
    "",
    "Commands:",
    "  agent                       Compact digest of the whole service (GET /api/agent).",
    "  status                      Liveness and the account-prune summary.",
    "  providers                   Merged provider cards, compact.",
    "  proxies                     Stored proxies, compact (no credentials).",
    "  accounts                    Known accounts and their signed-in state.",
    "  signin start --provider ID  Start a sign-in.",
    "  signin status [--wait ms]   The current sign-in flow.",
    "  signin code <code>          Hand a one-time code back to a waiting flow.",
    "  signin cancel               Cancel the running sign-in.",
    "  native start --provider ID  Start a sign-in magpie runs itself.",
    "  native status [--wait ms]   The current native sign-in flow.",
    "  native paste <text>         Paste a callback URL or code into it.",
    "  native cancel               Cancel the native sign-in.",
    "  proxy test <proxyId>        Probe a stored proxy and persist the result.",
    "  proxy score <proxyId>       Start the Claude trust-score check.",
    "  score status [--wait ms]    The trust-score job.",
    "  env [--wait ms]             The login browser and its download job.",
    "  env prepare [--wait ms]     Start the one-time browser download.",
    "  check <provider> <key>      The identity-check job for one account.",
    "",
    "Options:",
    "  --url URL        Service base URL (default http://127.0.0.1:3492).",
    "  --port N         Service port (default 3492).",
    "  --token HEX      Page token; read from the page automatically on loopback.",
    "  --wait [ms]      Block until the job settles (bare --wait means 60000).",
    "  --raw            Single-line JSON output.",
    "  --proxy ID       Exit proxy for signin start.",
    "  --method LABEL   Exact method label when a provider offers several.",
    "  --input k=v      An answer to a method prompt (repeatable).",
    "  --single         Replace the single stored account for this provider.",
    "",
  ].join("\n");
}

function emit(value, options, write) {
  write(`${JSON.stringify(value, null, options.raw === true ? 0 : 2)}\n`);
  return 0;
}

export async function runCli(argv, {
  fetchImpl = globalThis.fetch,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text),
  env = process.env,
} = {}) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];

  if (!command || command === "help" || command === "version" || options.help === true) {
    write(usage());
    return 0;
  }
  if (typeof fetchImpl !== "function") {
    throw new CliError("This runtime has no global fetch; use Node 18+ or Bun.", { code: "no_fetch" });
  }

  const base = resolveBase(options, env);
  const token = await resolveToken(base, options, fetchImpl);
  const get = (path) => call(fetchImpl, base, token, path);
  const post = (path, body) => call(fetchImpl, base, token, path, { method: "POST", body });

  switch (command) {
    case "agent":
      return emit(await get("/api/agent"), options, write);
    case "status":
      return emit(await get("/api/health"), options, write);
    case "providers": {
      const digest = await get("/api/agent");
      return emit(digest?.state?.providers ?? [], options, write);
    }
    case "proxies": {
      const digest = await get("/api/agent");
      return emit(digest?.state?.proxies ?? [], options, write);
    }
    case "accounts": {
      const digest = await get("/api/agent");
      return emit(digest?.state?.accounts ?? [], options, write);
    }

    case "signin": {
      const action = positional[1];
      if (action === "start") {
        const body = { provider: required(options.provider, "--provider") };
        if (options.proxy) body.proxy = { id: String(options.proxy) };
        if (options.method) body.methodLabel = String(options.method);
        if (options.single === true) body.single = true;
        const inputs = collectInputs(options.input);
        if (Object.keys(inputs).length > 0) body.inputs = inputs;
        await post("/api/signin", body);
        return emit({ flow: (await get(`/api/signin${waitQuery(options)}`))?.flow ?? null }, options, write);
      }
      if (action === "status") {
        return emit({ flow: (await get(`/api/signin${waitQuery(options)}`))?.flow ?? null }, options, write);
      }
      if (action === "code") {
        const code = positional[2] === undefined ? String(options.code ?? "") : positional[2];
        const payload = await post("/api/signin/code", { code: required(code, "<code>") });
        return emit({ flow: payload?.flow ?? null }, options, write);
      }
      if (action === "cancel") {
        return emit(await post("/api/signin/cancel"), options, write);
      }
      throw new CliError(`Unknown signin action: ${action ?? "(none)"}`, { code: "bad_command" });
    }

    case "native": {
      const action = positional[1];
      if (action === "start") {
        // magpie's own `accounts add` takes the agent id, which is the provider
        // id; `--provider` is accepted as the friendlier spelling.
        const agent = required(options.provider ?? options.agent, "--provider");
        await post("/api/native-signin", { agent });
        return emit(
          { flow: (await get(`/api/native-signin${waitQuery(options)}`))?.flow ?? null },
          options,
          write,
        );
      }
      if (action === "status") {
        return emit(
          { flow: (await get(`/api/native-signin${waitQuery(options)}`))?.flow ?? null },
          options,
          write,
        );
      }
      if (action === "paste") {
        const text = positional[2] === undefined ? String(options.text ?? "") : positional[2];
        const payload = await post("/api/native-signin/paste", { text: required(text, "<text>") });
        return emit({ flow: payload?.flow ?? null }, options, write);
      }
      if (action === "cancel") {
        return emit({ flow: (await post("/api/native-signin/cancel"))?.flow ?? null }, options, write);
      }
      throw new CliError(`Unknown native action: ${action ?? "(none)"}`, { code: "bad_command" });
    }

    case "proxy": {
      const action = positional[1];
      const id = required(positional[2] ?? options.id, "<proxyId>");
      const path = `/api/proxies/${encodeURIComponent(id)}`;
      if (action === "test") {
        return emit(await post(`${path}/test`, {}), options, write);
      }
      if (action === "score") {
        await post(`${path}/score`, {});
        return emit(await get(`/api/proxy-score${waitQuery(options)}`), options, write);
      }
      throw new CliError(`Unknown proxy action: ${action ?? "(none)"}`, { code: "bad_command" });
    }

    case "score": {
      const action = positional[1];
      if (action && action !== "status") {
        throw new CliError(`Unknown score action: ${action}`, { code: "bad_command" });
      }
      return emit(await get(`/api/proxy-score${waitQuery(options)}`), options, write);
    }

    case "env": {
      const action = positional[1];
      if (action && action !== "prepare") {
        throw new CliError(`Unknown env action: ${action}`, { code: "bad_command" });
      }
      if (action === "prepare") await post("/api/environment/prepare", {});
      return emit(await get(`/api/environment/job${waitQuery(options)}`), options, write);
    }

    case "check": {
      const provider = required(positional[1] ?? options.provider, "<provider>");
      const key = required(positional[2] ?? options.key, "<key>");
      const path = `/api/accounts/${encodeURIComponent(provider)}/${encodeURIComponent(key)}/check`;
      return emit(await get(`${path}${waitQuery(options)}`), options, write);
    }

    default:
      throw new CliError(`Unknown command: ${command}. Run \`clean-login help\`.`, {
        code: "bad_command",
      });
  }
}
