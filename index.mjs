import { startServer } from "./lib/server.mjs";

let starting;

function portOf(options) {
  const port = Number(options?.port ?? 3492);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 3492;
}

// The host calls this once when the page plugin loads. Keeping the promise
// here means a second call shares the same loopback service instead of
// binding the port twice.
export default {
  id: "magpie-clean-login",
  server: async (input = {}, options = {}) => {
    starting ??= startServer({
      port: portOf(options),
      // The sign-in flow instantiates the installed provider plugins with the
      // same input magpie gives this plugin: the real `client` (auth.set,
      // tui.showToast, app.log) and `magpie` API, plus the working directory
      // and shell. They stay in-process so `authorize()` and its returned
      // `callback()` share one lifecycle.
      client: input.client,
      magpie: input.magpie,
      pluginInput: input,
    }).catch((error) => {
      starting = undefined;
      throw error;
    });
    const service = await starting;
    console.log(`[clean-login] listening on http://127.0.0.1:${service.port}`);
    return {};
  },
};
