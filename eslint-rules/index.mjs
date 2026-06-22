/**
 * Local ESLint plugin holding the project's custom rules. Wired into
 * `eslint.config.mjs` under the `local/` namespace.
 *
 * Currently one rule: no-em-dash-in-jsx-text, guarding the recurring house-rule
 * violation (em dashes in copy a user sees). A leading-space-after-element rule
 * was investigated and deliberately NOT shipped: empirically (the @next/swc
 * transform and the built client chunk both confirm it) SWC PRESERVES the
 * leading space when the text is on the same line as the closing tag, so the
 * pattern the bug was thought to follow is actually safe; the form that does
 * drop is the newline-led one (`</tag>\n text`), which is standard JSX
 * whitespace and indistinguishable from the many legitimate no-space cases. A
 * lint rule there would be false-positive-prone, so the `{" "}` discipline plus
 * review remains the guard. (Reasoning recorded in DECISION_LOG.)
 */
import noEmDashInJsxText from "./no-em-dash-in-jsx-text.mjs";

const plugin = {
  meta: { name: "eslint-plugin-local-rendered-text" },
  rules: {
    "no-em-dash-in-jsx-text": noEmDashInJsxText,
  },
};

export default plugin;
