// Following magpie's light/dark switch while the page stays open.
//
// magpie mounts a plugin page in <iframe sandbox="allow-scripts"> and, on every
// change of its own theme, posts
//   { magpie: 1, event: "theme", data: { dark, lang, tokens } }
// to that frame's window. The host sends it with targetOrigin "*", so the
// message still arrives after the launcher frame has navigated itself to this
// loopback service (page/boot.js does exactly that), which is why this page can
// receive it at all: the frame's window outlives the document that used to sit
// in it.
//
// page/boot.js reads the theme once, on the way in, and carries it as ?theme=.
// That covers the value at open time. This module covers the changes after it,
// which used to be dropped on the floor: nothing in ui/ or page/ listened for
// the message, so the plugin kept the theme it was opened with until the page
// was closed and opened again.
//
// Only the light/dark bit is taken. magpie also sends its palette tokens, but
// this plugin has its own (ui/style.css, the editorial palette), and letting
// both sets through would make the two designs fight.
//
// Kept DOM-free apart from the two objects the caller hands in, so the message
// contract can be tested without a browser.

export const HOST_MESSAGE_FLAG = "magpie";
export const HOST_THEME_EVENT = "theme";

// Returns "dark" / "light" for a genuine theme message from the host, or null
// for anything else. `parent` is the window the page is framed in; a message
// from any other source is not the host and is ignored.
export function themeFromHostMessage(event, parent) {
  if (!event || typeof event !== "object") return null;
  if (!parent || event.source !== parent) return null;
  const message = event.data;
  if (!message || typeof message !== "object") return null;
  if (message[HOST_MESSAGE_FLAG] !== 1) return null;
  if (message.event !== HOST_THEME_EVENT) return null;
  const dark = message.data && typeof message.data === "object" ? message.data.dark : undefined;
  if (typeof dark !== "boolean") return null;
  return dark ? "dark" : "light";
}

// Applies the host's theme to the document for as long as the page lives.
// Returns an unsubscribe function; the page never needs it, a test does.
export function followHostTheme({ window: win = globalThis.window, document: doc = globalThis.document } = {}) {
  if (!win || typeof win.addEventListener !== "function") return () => {};
  const root = doc && doc.documentElement;
  if (!root || !root.dataset) return () => {};

  function onMessage(event) {
    const theme = themeFromHostMessage(event, win.parent);
    if (theme) root.dataset.theme = theme;
  }

  win.addEventListener("message", onMessage);
  return () => win.removeEventListener("message", onMessage);
}
