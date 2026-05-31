import type { Metadata } from "next";

import { PolicyEditor } from "@/components/admin/policy/policy-editor";
import { isCurrentUserSuperAdmin } from "@/lib/auth/access";
import { CAPABILITY_GROUPS } from "@/lib/settings/connections-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Policy & access",
};

/**
 * Policy & access (GOVERN, A2) — the super-admin editor for the org's connection
 * policy, over the enforcement shipped in the connector arc (closes D-066).
 *
 * Read failure vs genuine state: this reads the `connection_policy` row DIRECTLY
 * (not via `getConnectionPolicy`, whose fail-closed sentinel returns all-empty
 * arrays on error — indistinguishable from a genuinely empty saved policy). A
 * read error or a missing row (`error || data === null`) renders a calm error
 * state; only a successfully returned row populates the editor. So the deny-all
 * sentinel is never shown as if the admin had saved an empty policy.
 *
 * Super-admins get the interactive editor; every other admin who can reach the
 * admin section sees the same policy read only (no controls, no save), gated by
 * `isCurrentUserSuperAdmin()` which mirrors the write RLS (D-041). The admin
 * layout already gates the section to admins and owns the 896px left-justified
 * `<main>`; this page renders a fragment inside it.
 */

// Admin-facing one-line descriptions per category, keyed by the registry id.
// Shorter and admin-framed (vs the user-facing copy in connections-data).
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "file-storage": "Documents your agents can reference when drafting.",
  calendar: "Schedules your agents can read for context.",
  mail: "Inbox context for agents, and drafts on your approval.",
  messaging: "Conversations agents can reference and post to.",
  "matter-management": "Matters and deals from your organization’s systems.",
};

export default async function AdminPolicyPage() {
  const canEdit = await isCurrentUserSuperAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("connection_policy")
    .select("allowed_categories, default_capability_ceiling")
    .eq("id", 1)
    .maybeSingle();

  const loadFailed = Boolean(error) || data === null;

  const categories = CAPABILITY_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    description: CATEGORY_DESCRIPTIONS[group.id] ?? group.description,
  }));

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Policy & access
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Two decisions govern how your agents use connected tools: the most any
          connection is allowed to do, and which kinds of connections your
          organization permits.
        </p>
        {!loadFailed && !canEdit ? (
          <p className="mt-3 text-[13px] leading-[1.5] text-caption">
            Only super admins can change the connection policy. You’re viewing it
            as read only.
          </p>
        ) : null}
      </header>

      {loadFailed ? (
        <p
          role="alert"
          className="mt-10 rounded-lg border border-hairline bg-paper-2 px-4 py-3 text-[13px] leading-[1.5] text-foreground"
        >
          We couldn’t load the current policy. Reload the page to try again.
        </p>
      ) : (
        <PolicyEditor
          categories={categories}
          initialAllowWrite={(
            (data.default_capability_ceiling ?? []) as string[]
          ).includes("write")}
          initialAllowedCategories={
            (data.allowed_categories ?? []) as string[]
          }
          canEdit={canEdit}
        />
      )}
    </>
  );
}
