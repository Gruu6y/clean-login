// Pure helpers for provider cards. The Host owns the capability registry; the
// page only decides how to present its public fields.

export function localizedText(value, lang = "en") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value[lang] === "string" && value[lang]) return value[lang];
  if (typeof value.en === "string" && value.en) return value.en;
  for (const candidate of Object.values(value)) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return "";
}

export function providerStatusView(provider = {}, labels = {}) {
  const state = provider?.capability?.state;
  if (state === "ready") {
    return { state: "ready", label: labels.providerReady || "Ready" };
  }
  if (state === "blocked") {
    return { state: "blocked", label: labels.providerBlocked || "Blocked" };
  }
  return { state: "pending", label: labels.providerPending || "Pending verification" };
}

// A card offers the add-account entry when the installed plugin scan exposed a
// signable sign-in method AND the merge carried the installed plugin entry id
// the service loads the provider by (`signInProvider`). Capability readiness is
// deliberately NOT a gate: an unverified flow is exactly the one users should
// be able to try so they can report what happens. Pure, so the rule is testable
// without a DOM.
//
// "Signable" is broader than "browser": the scan cannot call authorize(), so it
// cannot tell a browser page from a device code. A method whose kind is only
// knowable at sign-in time (ZCode's per-site flows) is still offered; the page
// shown at sign-in is the source of truth.
export function providerCanSignIn(provider) {
  // The new flag decides when the card carries it: a method is offered when it
  // is runnable, whatever kind it turns out to be. Older cards only carry the
  // boolean `browser`.
  if (typeof provider?.signableMethod === "boolean") {
    return provider.signableMethod && Boolean(provider?.signInProvider);
  }
  return Boolean(provider?.browserMethod && provider?.signInProvider);
}

// The kinds a card marker can name. "pending" does not mean "nothing was
// found": it means the method is runnable but its kind is only confirmed when
// authorize() runs, so the card says "way to confirm" instead of "unknown".
// "device" is a real, confirmed kind (a device code the user confirms in the
// browser) and gets its own wording rather than falling back to "unknown".
export const METHOD_CATEGORY_TAGS = Object.freeze([
  "browser",
  "device",
  "form",
  "key",
  "local",
  "pending",
  "secret",
  "unknown",
]);

// The category of one scanned method. Prefer the scan's typed category; older
// shapes only carry the boolean `browser` and the type, so derive it from those.
export function methodCategory(method = {}) {
  const category = typeof method?.category === "string" ? method.category : "";
  if (METHOD_CATEGORY_TAGS.includes(category)) return category;
  if (method?.browser === true) return "browser";
  if (method?.type === "api" || method?.type === "key") return "key";
  return "unknown";
}

// The marker text for one category, in the page's language. Kept next to
// methodCategory() so the kind -> wording mapping is testable without a DOM.
export function methodCategoryText(category, text = {}) {
  if (category === "browser") return text.providerMethodBrowserTag || "browser";
  if (category === "device") return text.providerMethodDeviceTag || "device code";
  if (category === "form") return text.providerMethodFormTag || "needs details";
  if (category === "key") return text.providerMethodKeyTag || "key";
  if (category === "local") return text.providerMethodLocalTag || "local session";
  if (category === "secret") return text.providerMethodSecretTag || "paste a token";
  if (category === "pending") return text.providerMethodPendingTag || "way to confirm";
  return text.providerMethodUnknownTag || "way to confirm";
}
