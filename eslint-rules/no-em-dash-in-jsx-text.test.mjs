import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";

import rule from "./no-em-dash-in-jsx-text.mjs";

// Bridge ESLint's RuleTester onto vitest so each case is a real test.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-em-dash-in-jsx-text", rule, {
  valid: [
    // Plain JSX text with no em dash.
    "const a = <p>hello world</p>;",
    // Em dash in a COMMENT is never rendered — exempt.
    "// a — b\nconst a = <p>ok</p>;",
    // Em dash in a NON-JSX string (a const, a log) is never rendered — exempt.
    'const msg = "a — b";\nconst a = <p>{msg}</p>;',
    // En dash is allowed (legitimate ranges like 7–14 days).
    "const a = <p>7–14 days</p>;",
  ],
  invalid: [
    // Em dash directly in JSX text.
    {
      code: "const a = <p>a — b</p>;",
      errors: [{ messageId: "emDash" }],
    },
    // Em dash in a string literal rendered as a JSX child.
    {
      code: 'const a = <p>{"a — b"}</p>;',
      errors: [{ messageId: "emDash" }],
    },
    // Em dash in a JSX attribute value (placeholder, title, etc.).
    {
      code: 'const a = <input placeholder="a — b" />;',
      errors: [{ messageId: "emDash" }],
    },
    // Em dash in a template literal rendered as a JSX child.
    {
      code: "const a = <p>{`a — b`}</p>;",
      errors: [{ messageId: "emDash" }],
    },
  ],
});
