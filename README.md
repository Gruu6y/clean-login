# Clean Login · 干净登录

**One page in [magpie](https://usemagpie.ai) to manage your proxy exits and your provider sign-ins — each account signed in through its own clean browser.**

Every account gets its own browser profile, its own pinned fingerprint and the proxy you pick for it. The sign-in page never opens in your everyday browser, and two accounts of the same provider never look like the same machine.

> **Unofficial plugin.** Clean Login is built and maintained here, at [Gruu6y/clean-login](https://github.com/Gruu6y/clean-login). It is **not** a package published by `magpie-community`, and nobody has reviewed it but you. Read the code, open an issue, send a pull request — all three are welcome.

<sub>中文简介：在一个页面里管理代理出口和各家供应商的登录。每个账号都用自己的浏览器身份、固定的浏览器指纹，以及你指定的代理完成登录 —— 登录页不会进入你日常用的浏览器，同一个供应商的两个账号也不会被看成同一台机器。</sub>

---

## Features

- **Sign in to any provider magpie already knows.** Clean Login reads the provider plugins you have installed and offers an **Add account** entry wherever one exposes a browser sign-in. No separate provider list to maintain.
- **Pick the way you sign in.** When a provider offers several routes — a login page per site, a team plan, reusing the desktop app's session, pasting an API key — you choose, and Clean Login tells you which kind each one is before you start.
- **One proxy per account.** Choose the exit in the add-account dialog and the login browser really uses it. The provider's own traffic can use the same exit.
- **Test an exit before you trust it.** A real connection through the proxy reports the exit IP, its region, and the latency. No direct-connection fallback: if it fails, you see why.
- **Trust score per exit.** For each proxy you can read the Claude IP trust score that page publishes, opened through that very proxy, and keep the number next to the row.
- **Find the exit you need.** Filter your list by region and by a latency range without leaving the page.
- **Accounts keep their identity.** Signing an account out does not throw its browser identity away — signing back in reuses the same one, so a provider never sees a suspicious new machine.
- **Everything stays on this computer.** Proxies, accounts and browser profiles live in your own magpie folder. Stored proxy passwords are never shown to the page and never written to a log.
- **Four languages.** English, 简体中文, 繁體中文 and 日本語, following magpie's own language setting.

## Install

1. Open magpie → **Plugins** → **Discover** → **Unofficial**.
2. Find **Clean Login** by **Gruu6y** and press **Install**.
3. Open **Clean Login** from the sidebar.

If the list has not caught up yet, use **Retry** — magpie caches what GitHub told it.

> Requires **Windows x64** today. The plugin downloads a stripped-down browser runtime built for Windows; other platforms are not supported yet.

## Getting started

The first time you sign in, Clean Login downloads its own browser runtime — about **176 MB**, once. Everything after that runs offline from your machine.

1. **Proxy IPs** → add the exits you want to log in through.
2. Press **Test** on each one and check the exit IP and region look right. Add a trust score if you want a second opinion.
3. **Providers** → pick a provider → choose its proxy → **Add account**.
4. A separate browser window opens. Sign in there as usual; it finishes by itself and the account appears in magpie. Close the window to cancel instead.

## Good to know

- **Each account is its own browser.** Profiles, fingerprints and cookies belong to one account and are never shared, so signing in twice never merges two identities.
- **A provider needs a browser sign-in.** Providers that only accept a pasted token or a key are listed with that reason instead of an Add account button.
- **The plugin follows magpie.** It uses the provider plugins you already installed, so a provider you add to magpie shows up here too.
- **Nothing is shared with anyone.** There is no telemetry and no account: the only network calls are the ones you start — the proxy test, the trust score page, and the provider's own sign-in page.

## Something wrong?

Open an [issue](https://github.com/Gruu6y/clean-login/issues) and say what you expected, what happened, and which provider or proxy was involved. A screenshot of the message is worth a lot. Please do not paste real tokens or proxy passwords into an issue.

Pull requests are welcome. [`bun test`](package.json) runs the whole suite; a change without a test is a change nobody can trust later.

## License

[MIT](LICENSE).
