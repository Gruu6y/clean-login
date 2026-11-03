# @gruu6y/page-clean-login

> **Unofficial plugin / 非官方插件**
>
> This is an **unofficial** page plugin for [magpie](https://usemagpie.ai). It is
> **not** an official package published by `magpie-community`. The browser runtime is
> downloaded on first use from the [`Gruu6y/clean-login-browser`](https://github.com/Gruu6y/clean-login-browser)
> release. Install it through the GitHub topic [`magpie-plugin`](https://github.com/topics/magpie-plugin)
> channel: **Plugins → Discover → Unofficial**.
>
> 这是 magpie 的**非官方**页面插件，**并非** `magpie-community` 发布的官方包。
> 浏览器运行时会在首次使用时从 [`Gruu6y/clean-login-browser`](https://github.com/Gruu6y/clean-login-browser)
> 的 release 下载。安装方式：通过 GitHub topic [`magpie-plugin`](https://github.com/topics/magpie-plugin)
> 通道，在 **Plugins → Discover → Unofficial** 中找到并安装。

A page in [magpie](https://usemagpie.ai) for managing proxy IPs and provider sign-ins. Each account is signed in through its own browser profile and the proxy chosen for it, so the sign-in page never opens in the everyday browser.

The page keeps the user-facing model to two things:

- **Providers**: choose a provider, choose its proxy, add an account.
- **Proxy IPs**: add, edit, test and remove the exits providers can use.

OAuth links, tokens, callback ports, browser profiles and fingerprint settings are implementation details and stay out of the page.

## Status

The Page + Host loop is implemented: the launcher reaches the loopback service with the
window theme and language, the service serves the token-bearing UI, and the two tabs,
connection state and retry are driven by `GET /api/bootstrap` instead of mock state.

Proxy IP management is complete. The Proxy IPs panel can add, edit, delete and test
proxies, and it can score each exit's Claude trust, filter the list by region and by a
latency window, and is persisted across service restarts (the collection is included in
`/api/bootstrap`). The API never returns the stored `password`: it returns the username
plus a `hasPassword` flag, and an omitted `password` on update keeps the saved value.

Connection tests are real, not simulated. HTTP/HTTPS proxies use an HTTP `CONNECT`
tunnel (or an absolute-form request for plain HTTP targets) and SOCKS5 uses the
RFC 1928/1929 handshake, including username/password authentication where the proxy
supports it. Tests report the exit IP, region and latency from an HTTPS JSON IP/geo
endpoint (overridable with `MAGPIE_CLEAN_LOGIN_IP_ENDPOINT` for local tests), enforce a
timeout and never fall back to a direct connection. Failures are stored as an honest
`error` status with a safe message.

Provider capabilities are described by a static, auditable registry in
`lib/provider-registry.mjs`. It currently lists Google Antigravity, Codex and Claude,
and every provider is honestly marked `pending` with a reason because its real sign-in
flow has not been verified yet. On load the launcher reads magpie's `providers:list`
and forwards it in the navigation hash; `lib/provider-sources.mjs` normalizes and merges
it with the local registry. The Providers panel shows whether the list came from magpie
or fell back to the local registry, the size of the difference between the two, and an
honest note for providers only one side knows about. A card offers an **Add account**
entry whenever the installed plugin scan exposes a browser sign-in method for it; the
card carries the installed plugin entry id (`signInProvider`) that the service loads
the provider by, which can differ from the card's own id when the card was matched by
magpie's list or a display-name slug. Capability readiness is deliberately not the
gate: an unverified flow can still be tried, and a failure is reported as the server's
own code and message so users can report it. The public fields (id, name,
mark, localized description, agent id, sign-in mode, link-only flag, auth host allowlist,
callback port, localized notice and capability state/reason) are available from
`GET /api/providers` and are included in `GET /api/bootstrap`.

The add-account dialog chooses a stored proxy from a dropdown (name and address only;
the password never reaches the page) and starts `POST /api/signin` with the card's
`signInProvider`. The service resolves the stored proxy by id, so the browser really
uses the chosen exit while the credential stays inside the service. The dialog then
polls `GET /api/signin` and shows the flow state; `POST /api/signin/cancel` stops it,
and closing the dialog cancels a still-running flow instead of leaving it invisible.

## How it works

A magpie plugin page runs in a sandboxed frame with no network. This package therefore has two parts:

1. `page/index.html` and `page/boot.js`: the launcher magpie hosts. It reads the window's theme and the `port` option, then navigates its frame to the local service.
2. `index.mjs`: the host part, an OpenCode v1 plugin (`export default { id, server }`). It starts a service on `127.0.0.1` when magpie loads the plugin. `lib/server.mjs` serves the UI in `ui/`.

The service is loopback-only. Every `/api/` route requires a random per-process token written into the page it served, and the request `Host` must be the service's own. The page asks magpie only for the `providers:list` read: `permissions` is `["providers:list"]`. The real shape of that payload has not been verified on this machine, so the normalizer is deliberately tolerant and degrades to the local registry.

## Data

The plugin's data directory is:

- `$MAGPIE_CLEAN_LOGIN_DATA`, when set;
- otherwise `$MAGPIE_CONFIG_DIR/magpie-clean-login`;
- otherwise `$XDG_CONFIG_HOME/magpie/magpie-clean-login`;
- otherwise `~/.config/magpie/magpie-clean-login`.

Proxy records live in `proxies.json` in that directory. The directory is created with
mode `0700`, the file with mode `0600`, and writes go through a temporary file plus an
atomic rename. Nothing is written into the installed plugin package. The stored
`password` is used only for proxy authentication; it is never returned by the API or
written to a log line.

Each account has its own directory, `accounts/<provider>/<key>/`, holding its browser
profile (`profile/`), its pinned fingerprint (`identity.json`) and its ownership
ledger (`account.json`). The provider and key are escaped into filesystem-safe
segments (`#` becomes `%23`), and the pin is written once and never regenerated.
`identity.json` and `account.json` are written with mode `0600` through a temporary
file plus an atomic rename.

For local development and tests, `MAGPIE_CLEAN_LOGIN_IP_ENDPOINT` replaces the default
HTTPS IP/geo endpoint with any local HTTP or HTTPS JSON endpoint. The proxy client uses
only Node built-ins, so the tests run against local fake HTTP and SOCKS5 proxies without
network access.

## Trust score

`lib/proxy-score.mjs` adds a second, independent measurement per proxy: the Claude IP
信任评分 published by <https://ip.net.coffee/claude/>. `POST /api/proxies/:id/score`
starts one, `GET /api/proxy-score` reads it and `POST /api/proxy-score/cancel` closes the
window. The record gains `score` (0-100), `scoreLabel`, `scoreIp`, `scoreCheckedAt`,
`scoreError` and `scoreErrorCode`; a connection change clears them exactly like the
connection test fields.

The score is read from the page, never computed locally. The service opens the plugin's
own fingerprint browser at that URL **through the chosen proxy** (the same launcher and
`geoip` coupling the sign-in flow uses, `headless: false`), and the forked host polls
`#gaugeScore` until it holds a number. The address the score belongs to is taken from
the `href` of the link the page renders beside it, not from its visible text: the site
shortens long IPv6 addresses for display, so the text alone would not be an address.
The window is kept open after the reading so the user can look at the page.

One check runs at a time (`409 score_busy` otherwise), and the scoring browser has its
own persistent identity under `<dataDir>/score-browser/` — deliberately outside
`accounts/`, which the startup orphan sweep prunes against `plugin-auth.json`. The page
draws its number only after its own DNS/WebRTC/UDP checks, so the read is a poll with a
deadline: 90 s by default, `MAGPIE_CLEAN_LOGIN_SCORE_TIMEOUT_MS` overrides it. A deadline
is reported as `page_timeout` and never as a made-up number; other codes are
`browser_missing`, `executable_missing`, `launch_failed`, `launch_timeout` and
`score_missing`.

The Proxy IPs panel also filters client-side: region toggles built from the rows' own
`region` values (with per-region counts and a separate "untested" bucket) and a latency
window in milliseconds. Nothing is written to storage — magpie's page frame is an opaque
origin.

## Account keys

magpie keeps its provider sign-ins in `plugin-auth.json`. Its convention, straight
from the `freshKey` comment in the magpie source, is that "the first account is kept
under the provider's id, the others under `id#<slot>`": a new sign-in gets the bare
provider id while that key is free, and otherwise `<provider>#<random>`.

`lib/account-keys.mjs` implements that convention, isomorphic to magpie's
`freshKey`/`providerOf`. `freshAccountKey(provider, existingKeys, random)` is a pure
function: it returns the bare key when free and otherwise loops
`provider + "#" + random().toString(36).slice(2, 8)` until the key is unused,
including magpie's short-suffix behaviour when `toString(36)` has fewer than six
fractional digits. The only deliberate difference from magpie is a bound on the loop:
an always-colliding random source raises an error instead of spinning forever.
`readAuthKeys(env)` reads only the key names of `plugin-auth.json` under the shared
`magpieConfigDir`; it never reads, keeps or returns a value, and a missing or malformed
file yields an empty set instead of an error.

## Sign-in write-back

`lib/signin-writeback.mjs` is the write-back half of a sign-in: after the browser flow
returns a callback result it decides the final account key and calls
`client.auth.set({ path: { id: key }, body })`, the same call magpie's own `save` makes.
The browser orchestration and the UI live elsewhere.

The key is chosen with magpie's rules. A `single`-account provider always keeps its
first account key (`accountsOf` order: the bare provider id first, then `id#slot` in
lexicographic order); otherwise the sign-in is de-duplicated against existing entries
first, and only then allocated with `signInKey`, which reuses a named account of the
same provider or falls back to `freshAccountKey` (the bare key while it is free, then
`provider#` plus six random base36 characters). `chooseAccountKey` is exported on its
own so the choice can be tested without a client.

The body is shaped exactly like magpie's `save`: `type` and `provider` are dropped,
`refresh`, `access` and `expires` stay at the top level and every other callback field
(including the account's `accountId`/`uid`/`email`, which is what later identifies the
entry) is spread flat.

`writeBack` never throws: it returns `{ ok, key, created, updated, error, entry }`, with
`client` injectable so tests use a fake. `entry` is a non-credential summary of the
written account (`provider`, `key`, `accountId`, `uid`, `type`) used for the ownership
ledger; it never contains `access`, `refresh`, `key` (the credential field) or
`metadata`. A failure to read existing entries is treated as "no entries", so the
write can still use the bare key or a fresh one. `opts.forceKey` names the exact key
to write to and skips the settle name match, so a reused identity always lands on the
key the user picked.

### A deliberate narrowing of `settle`

`readAuthEntries(env)` returns, per key, only the non-credential fields `accountId`,
`uid`, `type` and `email` (`email` may fall back to `metadata.email`, but the
`metadata` object is never returned); `access`, `refresh` and `key` are never read.

That is an intentional narrowing of magpie's full `settle()`. Magpie can also match two
entries that both have no account name by comparing their secret; this module gives
that rare branch up, in exchange for never having to read a credential value. The
consequence is that two sign-ins that are both unnamed are treated as distinct accounts
and get separate keys, where magpie might have de-duplicated them. The named cases
still match: a non-empty and equal name with non-conflicting uids, and magpie's
`renamedBy` (same non-empty uid, different names, one of them the uid).

## Sign-in flow

`lib/signin-flow.mjs` is the server half of a provider sign-in. `POST /api/signin`
starts one with `{ provider, proxy?, single? }` and returns
`{ flowId, key, url, instructions }` as soon as the isolated browser has opened;
`GET /api/signin` reads the current flow and `POST /api/signin/cancel` stops it.
The HTTP routes require the same page token, `Host` and `Origin` checks as every
other API route.

`startSignIn` carries out the whole lifecycle in one call chain:

1. Pre-allocate the account key with magpie's `signInKey(provider, "new", …)`, so a
   `single` provider keeps its one slot and a new account gets the bare id or
   `id#<slot>`. The key set the allocation draws from also holds the keys of
   retired identities, so a new account is never given a directory that already
   belongs to a signed-out account.
2. Generate (or reuse) the account's pinned identity under
   `accountDir(env, provider, key)`.
3. Import the installed provider package in this process, instantiate it with the
   real `{ client, magpie }` magpie gave the plugin, and call the browser method's
   `authorize()`.
4. Launch the isolated browser at the returned URL with
   `lib/browser-launcher.mjs` (`launchSignInBrowser`), which forks a host process
   that owns the browser and returns `{ pid, close() }` without waiting on the
   login.
5. Run `callback()` in the background and, on success, `writeBack(...)` the result
   through `client.auth.set`.
6. Answer the request immediately with the flow id and the URL.

The state machine is `idle | authorizing | waiting-login | finishing | done |
error | cancelled`, one flow at a time. Failures are reported as distinct codes:
`plugin_missing`, `no_browser_method`, `no_url`, `browser_missing`,
`executable_missing`, `launch_failed`, `callback_failed`, `callback_timeout`,
`write_failed`, `retired_missing`, `invalid_account`, `identity_mismatch` and
`cancelled`.

### Identity is pinned

`lib/account-identity.mjs` keeps one directory per account (`accountDir`), holding
the account's browser profile and an `identity.json` fingerprint. `ensureIdentity`
generates the fingerprint exactly once, using camoufox's `generateFingerprint` for
the host OS with an OS-agnostic fallback, and returns the stored bytes on every
later call; it never regenerates. A provider's risk control links a credential to
the machine it signs in from, so re-presenting one credential from several
fingerprints looks like the credential was copied and is likely to be challenged.
The pin is therefore born with the account and survives sign-out
(`removeAccountDir` removes the profile, the pin and the ledger together, but only
when the identity is explicitly cleared). If a write-back de-duplicates a new
sign-in onto an existing account key, the just-created account directory is
reconciled onto that key so the pin stays beside the account it belongs to.

### Signed-out identities are retired, not reclaimed

magpie deletes the credential when an account signs out, so a signed-out account
has a directory with no key in `plugin-auth.json`. Keeping its pin is the whole
point: a later sign-in for that credential must present the same machine. A
completed sign-in therefore writes an ownership ledger, `account.json`, beside the
pin (`{ version: 1, provider, key, accountId, uid, signedInAt }`). The ledger is
written before `reconcileAccountDir` renames the directory onto the account's real
key, so it travels with the directory.

At startup `lib/account-prune.mjs` walks the account directories and sorts them
into four groups:

- a directory whose key is in `plugin-auth.json` is **kept** (it is signed in);
- a directory that carries a ledger is **retired**: the account is known and
  merely signed out, so its pin and profile are kept, never removed;
- a directory with no ledger and a fresh in-flight marker is **skipped**;
- a directory with no ledger and no fresh marker is an abandoned
  pre-allocation and is **removed**.

The sweep is best-effort and isolated: a directory that cannot be removed is
reported and the rest still run, and a failure never blocks the service from
starting. `GET /api/health` reports the counts (including `retired`) from the last
run and `POST /api/accounts/prune` runs one on demand. A directory that was created
before the ledger existed can be adopted with
`node scripts/backfill-account-meta.mjs` (dry run by default, `--apply` to write).

`GET /api/accounts` lists the ledger fields plus `signedIn`, and
`DELETE /api/accounts/<provider>/<key>` clears an identity only while it is signed
out (a signed-in key gets `409 signed_in`). The page's Providers tab lists the
signed-out identities and offers the same delete behind a confirmation; the
add-account dialog offers them as **Continue with an existing identity**. A claim
pre-allocates the chosen key and `ensureIdentity` returns the stored pin, so the
browser opens with the account's own profile and fingerprint.

Two guards protect the key/account invariant. A claim whose directory or ledger is
missing is refused with `retired_missing` before the browser opens. And on every
callback, before the write-back, the incoming `uid` (falling back to `accountId`)
is compared with the directory's ledger; a different account fails the flow with
`identity_mismatch`, nothing is written, and the directory stays retired. That is
what stops a reused key from putting one account's credential under another
account's pinned fingerprint.

A retired identity also keeps its key reserved: `startSignIn` merges the keys of
this provider's ledgered directories into the set `signInKey` allocates against
(and the write-back allocates against the same set), so a new identity is never
allocated a retired key, never opens that directory's pin and cookies, and its
credential never lands on that key. A `single` provider is the one exception --
it has exactly one slot, so there is nowhere else to put the account; it keeps
its fixed slot and relies on the uid guard and on the identity list, which lets
the user continue the retired identity explicitly.

### Abandoned pre-allocated directories are reclaimed

The account directory is created before the credential is: `startSignIn` reserves a
key and writes the pin, then waits for the user to finish in the browser. A sign-in
that is abandoned -- the callback times out, the browser errors, magpie reloads, the
user simply stops -- therefore leaves a directory with no credential pointing at it
and no ledger. Those directories are temporary. While a login is in flight,
`startSignIn` writes a small marker beside the pin; the startup sweep removes a
directory only when it has neither a key in `plugin-auth.json` nor a ledger nor a
fresh marker. A keyed or retired directory is never touched.

### Why the flow has a single lifetime

Everything after `authorize()` lives in the closure of a promise held in this
process's memory: the vendor polling loop (`callback()`) and the browser handle.
A magpie host reload drops that memory, so `authorize()` and `callback()` cannot
be split across two user requests. `startSignIn` therefore runs the whole chain
inside one call, keeps the callback in the background and exposes progress only
through `GET /api/signin`. `cancel()` flags the flow, closes the browser and lets
the background task stop at the next boundary; it cannot reach inside a
third-party `callback()` that is already awaiting a vendor response, so that
promise may keep polling until it finishes or times out, but its result is
ignored once the flow is cancelled.

## One-time browser and model preparation

`lib/browser-environment.mjs` prepares everything provider sign-in needs, once.
The browser is a pinned self-hosted slim Camoufox archive, downloaded into the
plugin's own cache and sha256-verified before unpacking
(`MAGPIE_CLEAN_LOGIN_BROWSER_URL` / `MAGPIE_CLEAN_LOGIN_BROWSER_SHA256`
override the source; an override without a digest is installed unverified and
reported as such). The fingerprint generator's model, `model-2/2026` from
`fpgen-js`, is installed in the same step into the plugin's own `fpgen`
directory beside the browser. The model directory is set explicitly before the
model is ensured, rather than left to import timing: Camoufox's own
`setModelDir` runs at module evaluation from `LOCALAPPDATA`, which the browser
install temporarily redirects, so the effective directory would otherwise
depend on which module was imported first. The user-shared Camoufox cache is
never written. Browser and model progress are reported as separate stages, and
a model download failure has its own error code, distinct from a browser
download failure.

### Measured

Measured 2026-11-03 on this machine through the plugin's own installer.

| | |
|---|---:|
| browser download | 176,170,139 bytes (168.0 MiB) |
| model download (`MODEL_PIN.size`) | 1,564,571 bytes (1.5 MiB) |
| total download | 177,734,710 bytes (169.5 MiB) |
| browser installed | 432,910,039 bytes (412.8 MiB) |
| model installed (three `.zst` members + decompressed `values.dat`) | 213,104,823 bytes (203.2 MiB) |
| total installed | 646,014,862 bytes (616.1 MiB) |
| required free disk (`REQUIRED_DISK_BYTES`) | 1,092,184,717 bytes (1,041.5 MiB) |
| first-run install | ~24 s (22 s browser measured earlier + 2 s model) |

The model is a ~1.5 MB download that unpacks to about 204 MB. The model's report
above is the live `modelBytes` the manager measured, 213,104,823 bytes.

## Development

From the repository root:

```sh
npx --yes bun@1.4.4 test packages/clean-login
npx --yes bun@1.4.4 scripts/check.mjs clean-login
```

## License

MIT. See [LICENSE](LICENSE).
