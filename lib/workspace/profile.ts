/**
 * Shared profile shape + display helpers used by both `WorkspaceRail`
 * and `AdminRail`. Extracted from `workspace-rail.tsx` in Session 30 so
 * both rails compute display name / initials / role label identically.
 */

export type ProfileShape = {
  full_name: string | null;
  email: string;
  role: "super_admin" | "org_admin" | "user";
};

export const ROLE_LABEL: Record<ProfileShape["role"], string> = {
  super_admin: "Super admin",
  org_admin: "Org admin",
  user: "User",
};

export function getDisplayName(profile: ProfileShape): string {
  const trimmed = profile.full_name?.trim();
  if (trimmed) return trimmed;
  const local = profile.email.split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : profile.email;
}

export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return `${first}${last}`.toUpperCase();
  }
  return (parts[0] ?? "").slice(0, 2).toUpperCase();
}
