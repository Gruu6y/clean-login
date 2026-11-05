import { startServer } from "./lib/server.mjs";

let starting;
let service = null;

function portOf(options) {
  const port = Number(options?.port ?? 3492);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3492;
}

// Test-only handle on the background start. magpie only ever sees the default
// export; this lets a test await the service that `server()` deliberately does
// not wait for, and close it again.
export const __testing = {
  get starting() {
    return starting;
  },
  get service() {
    return service;
  },
  reset() {
    starting = undefined;
    service = null;
  },
};

// The host calls this once when the page plugin loads. magpie gives `server()`
// a bounded load budget, and during an update the old host still owns port 3492
// until it exits. Awaiting the bind here used up that budget and made magpie
// mark the plugin "didn't load" -- a state it persisted and never retried, so
// the page kept showing `network` even after the port was free again.
//
// So the load and the bind are decoupled: `server()` resolves immediately and
// the service binds in the background with an unbounded retry. As soon as the
// previous host lets go of the port, this process takes it over with no restart
// and no reinstall. `starting` is kept so a second call shares the same service
// instead of binding the port twice.
export default {
  id: "magpie-clean-login",
  server: async (input = {}, options = {}) => {
    starting ??= startServer({
      port: portOf(options),
      // The bind no longer lives inside magpie's loadWait, so it must not be
      // capped by it either: the port is handed over whenever the old host
      // exits, which can be after any fixed window.
      portRetryMs: Number.POSITIVE_INFINITY,
      // The sign-in flow instantiates the installed provider plugins with the
      // same input magpie gives this plugin: the real `client` (auth.set,
      // tui.showToast, app.log) and `magpie` API, plus the working directory
      // and shell. They stay in-process so `authorize()` and its returned
      // `callback()` share one lifecycle.
      client: input.client,
      magpie: input.magpie,
      pluginInput: input,
    }).then((started) => {
      service = started;
      console.log(`[clean-login] listening on http://127.0.0.1:${started.port}`);
      return started;
    }).catch((error) => {
      // A failure that is not the port being taken (a corrupt data directory,
      // a provider that cannot load) still has to be visible in magpie's log,
      // and a later `server()` call gets to try again.
      starting = undefined;
      console.error(`[clean-login] service failed to start: ${String(error?.message ?? error)}`);
      return null;
    });
    return {};
  },
};
