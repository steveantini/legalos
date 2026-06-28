import { redirect } from "next/navigation";

import { isCurrentUserAdmin, requireAuthUser } from "@/lib/auth/access";

/**
 * The legacy Collections route is retired (Policy & access arc, Phase B). Curated
 * folder-collection management moved into Policy & access → Knowledge & access,
 * so this route now redirects, role-aware: admins to the relocated manager (the
 * admin section 404s non-admins, so a blanket redirect would strand members),
 * everyone else to the Knowledge landing with the two tools.
 *
 * Members lose the old read-only curated view here BY DESIGN; they still see
 * curated collections as folders where they use them, in Research and Structured
 * Query.
 */
export default async function CollectionsPage() {
  await requireAuthUser();
  const isAdmin = await isCurrentUserAdmin();
  redirect(
    isAdmin ? "/workspace/admin/policy#knowledge-access" : "/workspace/knowledge",
  );
}
