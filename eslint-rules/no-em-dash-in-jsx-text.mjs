/**
 * Custom ESLint rule: no em dash in text a user will see (D-165-era house rule,
 * codified). The project bans em dashes in narrative/rendered copy; they kept
 * slipping into JSX across marketing, docs, and platform surfaces and were
 * cleaned by hand three times. This catches them at write time.
 *
 * FLAGS (rendered text):
 *   - JSXText nodes:                 <p>a — b</p>
 *   - string literals as JSX children: <p>{"a — b"}</p>
 *   - string literals as JSX attribute values: <input placeholder="a — b" />
 *   - template literals as JSX children: <p>{`a — b`}</p>
 *
 * DELIBERATELY DOES NOT FLAG (never rendered):
 *   - comments (not AST string nodes, so they are inherently exempt)
 *   - non-JSX string literals (a plain const, a thrown Error, a server log)
 *   - identifiers, imports
 *
 * EN DASH IS NOT FLAGGED: the house rule targets em dashes, and en dashes are
 * legitimate in numeric/day ranges ("7–14 days"). Flagging them would create
 * false positives on real content.
 *
 * Report-only: the right replacement (comma, period, colon, parentheses) is
 * context-dependent, so an autofix would guess wrong. Fix by hand.
 *
 * Escape hatch: if a flagged string is genuinely never rendered (a rare case
 * this rule's scoping can't tell apart), add an inline
 * `eslint-disable-next-line local/no-em-dash-in-jsx-text` with a one-line reason.
 */

const EM_DASH = "—"; // —

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow em dashes in JSX text and JSX string literals a user will see. Comments and non-rendered strings are exempt.",
    },
    schema: [],
    messages: {
      emDash:
        "Em dash in rendered text. The house rule bans em dashes in copy a user will see; use a comma, period, colon, or parentheses instead. (Comments and non-rendered strings are exempt.) If this string is genuinely never rendered, add an inline eslint-disable-next-line with a reason.",
    },
  },
  create(context) {
    /** A string/template literal rendered as a JSX child: `<X>{"…"}</X>`. */
    function isRenderedJsxChild(node) {
      const parent = node.parent;
      return (
        parent &&
        parent.type === "JSXExpressionContainer" &&
        parent.parent &&
        (parent.parent.type === "JSXElement" ||
          parent.parent.type === "JSXFragment")
      );
    }

    return {
      JSXText(node) {
        if (node.value.includes(EM_DASH)) {
          context.report({ node, messageId: "emDash" });
        }
      },
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!node.value.includes(EM_DASH)) return;
        // A JSX attribute value (placeholder, title, aria-label, etc.) or a
        // string rendered as a JSX child. Other string literals never render.
        if (node.parent && node.parent.type === "JSXAttribute") {
          context.report({ node, messageId: "emDash" });
          return;
        }
        if (isRenderedJsxChild(node)) {
          context.report({ node, messageId: "emDash" });
        }
      },
      TemplateLiteral(node) {
        if (!isRenderedJsxChild(node)) return;
        if (node.quasis.some((q) => q.value.raw.includes(EM_DASH))) {
          context.report({ node, messageId: "emDash" });
        }
      },
    };
  },
};

export default rule;
