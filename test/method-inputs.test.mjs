// The prompts a sign-in method declares and the answers the page may send back.
// Pure functions: no filesystem, no plugin import, no browser.

import { expect, test } from "bun:test";
import {
  INPUT_FIELD_TYPES,
  MAX_INPUT_FIELDS,
  MAX_INPUT_VALUE_LENGTH,
  methodInputFields,
  readMethodInputs,
  requiredInputKeys,
  sanitizeSubmittedInputs,
} from "../lib/method-inputs.mjs";

// The shapes the installed plugins really declare (see
// test/evidence/scan-real-plugins.mjs): ZCode's team picker, Qoder CN's VPC
// instance and dedicated domain, and the two PAT prompts.
const teamPrompt = {
  type: "select",
  key: "site",
  message: "Where is the team's plan?",
  options: [
    { label: "Z.ai", value: "zai" },
    { label: "BigModel", value: "bigmodel" },
  ],
};
const vpcPrompt = { type: "text", key: "vpc", message: "Your enterprise's VPC instance" };
const patPrompt = {
  type: "password",
  key: "pat",
  message: "Your Personal Access Token",
  placeholder: "pt-…",
};

test("the projection keeps the type, key, question and options only", () => {
  const fields = methodInputFields({
    type: "oauth",
    prompts: [
      teamPrompt,
      vpcPrompt,
      { ...patPrompt, default: "preset", validate: () => true, transform: () => "x" },
      { type: "notice", key: "hint", message: "not a field" },
      { type: "text", key: "" },
      { type: "text", key: "__proto__" },
      null,
      "junk",
    ],
  });
  expect(INPUT_FIELD_TYPES).toEqual(["text", "password", "select"]);
  expect(fields).toEqual([
    {
      type: "select",
      key: "site",
      message: "Where is the team's plan?",
      options: [
        { label: "Z.ai", value: "zai" },
        { label: "BigModel", value: "bigmodel" },
      ],
    },
    { type: "text", key: "vpc", message: "Your enterprise's VPC instance", options: [] },
    { type: "password", key: "pat", message: "Your Personal Access Token", options: [] },
  ]);
  // No default, placeholder, validator, transform or entered value survives.
  const serialized = JSON.stringify(fields);
  for (const leak of ["preset", "pt-…", "validate", "transform"]) {
    expect(serialized).not.toContain(leak);
  }
});

test("a method with no prompts declares no fields", () => {
  expect(methodInputFields({ type: "oauth", label: "Cursor (browser)" })).toEqual([]);
  expect(methodInputFields(undefined)).toEqual([]);
  expect(requiredInputKeys({ type: "oauth" })).toEqual([]);
});

test("the field count and the option list are bounded", () => {
  const many = Array.from({ length: MAX_INPUT_FIELDS + 4 }, (_, index) => ({
    type: "text",
    key: `f${index}`,
    message: `field ${index}`,
  }));
  expect(methodInputFields({ prompts: many })).toHaveLength(MAX_INPUT_FIELDS);
  const options = methodInputFields({
    prompts: [
      {
        type: "select",
        key: "site",
        options: [{ label: "no value" }, { value: "ok", label: "OK" }, null, "junk"],
      },
    ],
  });
  expect(options[0].options).toEqual([{ label: "OK", value: "ok" }]);
});

test("only declared keys reach the plugin, and blank optional answers are dropped", () => {
  const read = readMethodInputs({ prompts: [teamPrompt, vpcPrompt] }, {
    site: " bigmodel ",
    vpc: "   ",
    pat: "pt-secret",
    __proto__: "polluted",
  });
  // `vpc` is a required text field, so blanking it is refused.
  expect(read.ok).toBe(false);
  expect(read.code).toBe("method_input_required");
  expect(read.message).toBe("Your enterprise's VPC instance");

  const optional = readMethodInputs({ prompts: [teamPrompt] }, { site: "zai", extra: "smuggled" });
  expect(optional).toEqual({ ok: true, inputs: { site: "zai" } });
});

test("a select left on the blank option falls back to the plugin's default", () => {
  expect(readMethodInputs({ prompts: [teamPrompt] }, {})).toEqual({ ok: true, inputs: {} });
  expect(readMethodInputs({ prompts: [teamPrompt] }, null)).toEqual({ ok: true, inputs: {} });
});

test("a select answer the plugin never offered is refused", () => {
  const read = readMethodInputs({ prompts: [teamPrompt] }, { site: "evil.example" });
  expect(read.ok).toBe(false);
  expect(read.code).toBe("method_input_invalid");
  expect(read.message).toBe("Where is the team's plan?");
});

test("an over-long answer is refused instead of truncated", () => {
  const long = "x".repeat(MAX_INPUT_VALUE_LENGTH + 1);
  expect(readMethodInputs({ prompts: [patPrompt] }, { pat: long })).toMatchObject({
    ok: false,
    code: "method_input_invalid",
  });
  expect(readMethodInputs({ prompts: [patPrompt] }, { pat: "pt-ok" })).toEqual({
    ok: true,
    inputs: { pat: "pt-ok" },
  });
});

test("a malformed body never reaches the flow", () => {
  expect(sanitizeSubmittedInputs(undefined)).toEqual({ ok: true, inputs: {} });
  expect(sanitizeSubmittedInputs({ site: "zai" })).toEqual({ ok: true, inputs: { site: "zai" } });
  expect(sanitizeSubmittedInputs(["site"])).toMatchObject({ ok: false, code: "invalid_inputs" });
  expect(sanitizeSubmittedInputs({ site: 5 })).toMatchObject({ ok: false, code: "invalid_inputs" });
  expect(sanitizeSubmittedInputs({ site: "x".repeat(MAX_INPUT_VALUE_LENGTH + 1) })).toMatchObject({
    ok: false,
    code: "invalid_inputs",
  });
  const tooMany = Object.fromEntries(
    Array.from({ length: MAX_INPUT_FIELDS * 2 + 1 }, (_, index) => [`k${index}`, "v"]),
  );
  expect(sanitizeSubmittedInputs(tooMany)).toMatchObject({ ok: false, code: "invalid_inputs" });
});

test("requiredInputKeys names only the fields that cannot be left blank", () => {
  expect(requiredInputKeys({ prompts: [teamPrompt, vpcPrompt, patPrompt] })).toEqual([
    "vpc",
    "pat",
  ]);
});
