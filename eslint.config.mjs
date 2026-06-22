import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import localRenderedText from "./eslint-rules/index.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Local guard against em dashes in copy a user sees (see eslint-rules/), at
  // error level so the standing lint-0 baseline catches them at write time
  // rather than per screen. (A leading-space-after-element rule was
  // investigated and not shipped — see eslint-rules/index.mjs for why.)
  {
    plugins: { local: localRenderedText },
    rules: {
      "local/no-em-dash-in-jsx-text": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Historical design-canvas artifacts (CLAUDE.md: "Design artifacts
    // (historical reference)"). These .jsx files are not app code and are not
    // built; linting them only adds standing noise that hides real findings.
    "docs/design/**",
  ]),
]);

export default eslintConfig;
