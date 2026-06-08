import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
