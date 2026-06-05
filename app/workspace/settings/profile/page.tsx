import type { Metadata } from "next";

import {
  getCurrentUserProfile,
  isCurrentUserPlatformOwner,
} from "@/lib/auth/access";
import { SETTINGS_PAGE_MAX_WIDTH } from "@/lib/settings/layout";
import { ROLE_LABEL, type ProfileShape } from "@/lib/workspace/profile";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * Settings Profile page. A calm, read-only account-identity surface in the
 * settings register (D-075): it tells the signed-in user WHO they are signed in
 * as, so the account behind the session is never ambiguous. The email is the
 * primary fact (it answers "which account is this?"); name and role follow, and
 * the platform-owner line appears only for an account that holds that
 * cross-tenant capability.
 *
 * Read-only for now. Editing name and photo is a later arc; this page's job is
 * identity, not account management, so it sets that expectation honestly rather
 * than shipping dead edit controls.
 */
export default async function SettingsProfilePage() {
  const profile = await getCurrentUserProfile();
  const isPlatformOwner = await isCurrentUserPlatformOwner();

  const fullName = profile?.full_name?.trim();
  const rows: Array<{ label: string; value: string }> = [
    { label: "Email", value: profile?.email ?? "Not available" },
    { label: "Name", value: fullName || "Not set" },
    {
      label: "Role",
      value: profile
        ? ROLE_LABEL[profile.role as ProfileShape["role"]]
        : "Not available",
    },
  ];
  // Platform owner is a separate cross-tenant capability; surface it only when
  // the account actually holds it (a positive, distinguishing fact).
  if (isPlatformOwner) {
    rows.push({ label: "Platform access", value: "Platform owner" });
  }

  return (
    <main className={`w-full ${SETTINGS_PAGE_MAX_WIDTH}`}>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Profile
        </h1>
        <p className="mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Your account and how you’re signed in.
        </p>
      </header>

      <section aria-label="Account" className="mt-10">
        <div className="overflow-hidden rounded-xl border border-hairline bg-paper-2">
          <dl>
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline gap-6 border-b border-hairline px-5 py-4 last:border-b-0"
              >
                <dt className="w-[150px] shrink-0 text-[13px] text-caption">
                  {row.label}
                </dt>
                <dd className="min-w-0 flex-1 break-words text-[14.5px] text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-3 text-[12.5px] leading-[1.5] text-caption">
          This is the account you’re signed in as. Editing your name and photo is
          coming soon.
        </p>
      </section>
    </main>
  );
}
