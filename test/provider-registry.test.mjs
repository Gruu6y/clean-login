import { expect, test } from "bun:test";
import {
  PROVIDERS,
  PROVIDER_CAPABILITY_STATES,
  PROVIDER_PUBLIC_FIELDS,
  listProviders,
  publicProvider,
} from "../lib/provider-registry.mjs";

const LANGS = ["en", "zh-Hans", "zh-Hant", "ja"];
const SECRET_KEY = /^(client[_-]?id|client[_-]?secret|secret|token|access[_-]?token|refresh[_-]?token|password|api[_-]?key|authorization|credentials?)$/i;

function deepKeys(value, keys = []) {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    deepKeys(child, keys);
  }
  return keys;
}

test("the registry has fixed, uniquely identified providers with every public field", () => {
  expect(Array.isArray(PROVIDERS)).toBe(true);
  expect(PROVIDERS.length).toBeGreaterThan(0);
  const ids = PROVIDERS.map((provider) => provider.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(["antigravity", "codex", "claude"]);

  for (const provider of PROVIDERS) {
    expect(provider.id).toMatch(/^[a-z0-9-]+$/);
    expect(provider.name.length).toBeGreaterThan(0);
    expect(provider.mark.kind).toBe("letter");
    expect(provider.mark.text.length).toBeGreaterThan(0);
    expect(provider.mark.tone.length).toBeGreaterThan(0);
    expect(provider.agentId).toMatch(/^[a-z0-9-]+$/);
    expect(provider.signInMode).toBeTruthy();
    expect(typeof provider.linkOnly).toBe("boolean");
    expect(Array.isArray(provider.authHosts)).toBe(true);
    if (provider.signInMode === "token-import") {
      // Token import has no browser navigation, so there is no auth host and
      // no callback port to claim.
      expect(provider.authHosts).toEqual([]);
      expect(provider.callbackPort).toBeNull();
    } else {
      expect(provider.authHosts.length).toBeGreaterThan(0);
    }
    for (const host of provider.authHosts) {
      expect(host).toMatch(/^[a-z0-9.-]+$/);
      expect(host).not.toContain("/");
    }
    expect(provider.callbackPort === null || Number.isInteger(provider.callbackPort)).toBe(true);
    if (provider.callbackPort !== null) {
      expect(provider.callbackPort).toBeGreaterThanOrEqual(1024);
      expect(provider.callbackPort).toBeLessThanOrEqual(65535);
    }
    for (const lang of LANGS) {
      expect(provider.description[lang]).toBeTruthy();
    }
    // `notice` is optional now: a card only carries one when it has something
    // to say that the description does not already say.
    for (const value of Object.values(provider.notice)) {
      expect(typeof value).toBe("string");
    }
    // No verification reason is written any more. A state that can never change
    // does not deserve a sentence on every card.
    expect(Object.keys(provider.capability.reason)).toEqual([]);
    expect(PROVIDER_CAPABILITY_STATES).toContain(provider.capability.state);
  }
});

test("the registry writes no verification reason and no card claims readiness", () => {
  for (const provider of PROVIDERS) {
    expect(provider.capability.state).not.toBe("ready");
    expect(["pending", "blocked"]).toContain(provider.capability.state);
    expect(Object.keys(provider.capability.reason)).toEqual([]);
    expect(JSON.stringify(provider.notice)).not.toMatch(/not verified|not been verified|unverified/i);
  }
});

test("the registry contains no secret fields or credential values", () => {
  for (const provider of PROVIDERS) {
    expect(Object.keys(provider).sort()).toEqual([...PROVIDER_PUBLIC_FIELDS].sort());
    for (const key of deepKeys(provider)) expect(key).not.toMatch(SECRET_KEY);
    expect(JSON.stringify(provider)).not.toMatch(
      /client[_-]?secret|client[_-]?id|access[_-]?token|refresh[_-]?token|api[_-]?key|password/i,
    );
  }
});

test("the public projection keeps only the allowlisted capability fields", () => {
  expect(listProviders()).toEqual(PROVIDERS.map(publicProvider));
  const withPrivate = {
    ...PROVIDERS[0],
    clientSecret: "must-not-leak",
    accessToken: "must-not-leak",
  };
  const pub = publicProvider(withPrivate);
  expect(pub.clientSecret).toBeUndefined();
  expect(pub.accessToken).toBeUndefined();
  expect(Object.keys(pub).sort()).toEqual([...PROVIDER_PUBLIC_FIELDS].sort());
  expect(JSON.stringify(pub)).not.toContain("must-not-leak");
});
