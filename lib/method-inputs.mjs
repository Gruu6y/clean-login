// The answers a sign-in method asks for before it can start.
//
// Several installed plugins open a browser page only after they know something
// the page cannot guess: ZCode's team flow asks which site the team's plan is
// on, Qoder CN's enterprise flows ask for the VPC instance or the dedicated
// domain, QwenWork's flagship asks for the enterprise's domain, and the two PAT
// flows ask for the token to exchange. Those methods declare the question in
// `prompts`; the host normally collects the answers and calls
// `authorize(inputs)`. clean-login is the host here, so it has to do the same,
// or the method either throws or silently takes a default (ZCode's team flow
// would always sign in to Z.ai).
//
// This module is the one place that decides which prompts the page may answer
// and which answers are acceptable. It is pure: no filesystem, no plugin code,
// no network, so both the service and the page-side projection can share it.

// The prompt types the dialog can render: a one-line text field, a masked
// field, and a choice between the options the plugin itself declares. A prompt
// of another type is left alone rather than guessed at.
export const INPUT_FIELD_TYPES = Object.freeze(["text", "password", "select"]);

// Bounds. A prompt count and a value length are third-party data, so both are
// capped before anything is rendered, forwarded or stored.
export const MAX_INPUT_FIELDS = 8;
export const MAX_INPUT_KEY_LENGTH = 64;
export const MAX_INPUT_VALUE_LENGTH = 512;

// Keys that would reach Object.prototype through a plain assignment.
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value : "";
}

// The prompts of one method, projected into the shape the dialog renders and
// the service accepts: only the field type, its key, the plugin's own question
// and a select's options. Defaults, placeholders, entered values, `validate`
// and `transform` never survive this projection, so nothing user-typed or
// executable can travel through a card payload.
export function methodInputFields(method) {
  const prompts = Array.isArray(method?.prompts) ? method.prompts : [];
  const fields = [];
  for (const prompt of prompts) {
    if (!isPlainObject(prompt)) continue;
    const type = text(prompt.type);
    if (!INPUT_FIELD_TYPES.includes(type)) continue;
    const key = text(prompt.key).trim();
    if (!key || key.length > MAX_INPUT_KEY_LENGTH || RESERVED_KEYS.has(key)) continue;
    const options = Array.isArray(prompt.options)
      ? prompt.options
          .filter(isPlainObject)
          .map((option) => ({ label: text(option.label), value: text(option.value) }))
          .filter((option) => option.value.length > 0)
      : [];
    fields.push({ type, key, message: text(prompt.message), options });
    if (fields.length >= MAX_INPUT_FIELDS) break;
  }
  return fields;
}

// The page sends a plain object of strings. Anything else — a nested object, a
// number, an over-long value, too many keys — is refused here, before the
// service looks at the method, so a malformed body never reaches plugin code.
export function sanitizeSubmittedInputs(raw) {
  if (raw === undefined || raw === null) return { ok: true, inputs: {} };
  if (!isPlainObject(raw)) {
    return { ok: false, code: "invalid_inputs", message: "The answers must be an object of strings." };
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_INPUT_FIELDS * 2) {
    return { ok: false, code: "invalid_inputs", message: "Too many answers were sent." };
  }
  const inputs = {};
  for (const [key, value] of entries) {
    if (!key || key.length > MAX_INPUT_KEY_LENGTH || RESERVED_KEYS.has(key)) {
      return { ok: false, code: "invalid_inputs", message: "An answer has an unusable name." };
    }
    if (typeof value !== "string") {
      return { ok: false, code: "invalid_inputs", message: `The answer to "${key}" must be a string.` };
    }
    if (value.length > MAX_INPUT_VALUE_LENGTH) {
      return { ok: false, code: "invalid_inputs", message: `The answer to "${key}" is too long.` };
    }
    // A blank field is not an answer: dropping it here means a form left
    // untouched travels as "nothing was sent", so the plugin's own default
    // applies instead of an empty string overriding it.
    const trimmed = value.trim();
    if (trimmed) inputs[key] = trimmed;
  }
  return { ok: true, inputs };
}

// The answers a method will actually be called with. Only keys the method
// declares survive, so a page cannot smuggle an extra input into plugin code.
// A declared text or password field with no answer is a hard stop: the plugin
// would throw a message of its own, and reporting the missing field here names
// the question the user left blank. A `select` left blank is not an error —
// the plugin's own default applies — and a select answered with something the
// plugin never offered is refused rather than forwarded.
export function readMethodInputs(method, submitted) {
  const fields = methodInputFields(method);
  if (fields.length === 0) return { ok: true, inputs: {} };
  const raw = isPlainObject(submitted) ? submitted : {};
  const inputs = {};
  for (const field of fields) {
    const value = text(raw[field.key]).trim();
    if (!value) {
      if (field.type === "select") continue;
      return {
        ok: false,
        code: "method_input_required",
        message: field.message || `This sign-in needs "${field.key}".`,
      };
    }
    if (value.length > MAX_INPUT_VALUE_LENGTH) {
      return {
        ok: false,
        code: "method_input_invalid",
        message: field.message || `The answer to "${field.key}" is too long.`,
      };
    }
    if (field.type === "select" && field.options.length > 0) {
      const allowed = field.options.some((option) => option.value === value);
      if (!allowed) {
        return {
          ok: false,
          code: "method_input_invalid",
          message: field.message || `"${value}" is not one of the choices.`,
        };
      }
    }
    inputs[field.key] = value;
  }
  return { ok: true, inputs };
}

// The questions a method still has to have answered before it can start, as the
// page-side labels. Used by the dialog to mark a required field; the service
// enforces the same rule through readMethodInputs.
export function requiredInputKeys(method) {
  return methodInputFields(method)
    .filter((field) => field.type !== "select")
    .map((field) => field.key);
}
