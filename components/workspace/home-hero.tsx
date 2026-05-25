import { siteConfig } from "@/config/site";
import { getFirstName, type ProfileShape } from "@/lib/workspace/profile";

type HomeHeroProps = {
  profile: ProfileShape;
  hasAnyAccess: boolean;
};

const headingClass =
  "max-w-[28ch] text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground";
const sublineClass =
  "mt-[14px] max-w-[56ch] text-[14.5px] leading-[1.5] text-muted-foreground";

/**
 * Personalized greeting at the top of the workspace home (/workspace).
 * Replaces the prior product-tagline workspace hero.
 *
 * Two branches:
 *   - No access (no department grants yet): a welcoming "Welcome to
 *     legalOS." plus a request-access mailto, carrying forward the
 *     prior landing's empty-state CTA (admin email + prefilled subject
 *     and body) so a freshly provisioned user has a clear next step.
 *   - Has access: "Welcome back, {firstName}." when a first name is
 *     available, otherwise "Welcome back." `getFirstName` returns null
 *     for users with no real `full_name`, so we never greet an
 *     email-derived string.
 *
 * Typography matches the department directory and Stage 1 group
 * landings (44px / 400 / -0.03em h1, 14.5px subline) for a consistent
 * page-header voice across the workspace.
 */
export function HomeHero({ profile, hasAnyAccess }: HomeHeroProps) {
  if (!hasAnyAccess) {
    const requestAccessHref =
      `mailto:${siteConfig.adminEmail}` +
      `?subject=${encodeURIComponent("Request access to legalOS")}` +
      `&body=${encodeURIComponent(
        "Hi, I'd like to request access to a department in legalOS.",
      )}`;

    return (
      <section>
        <h1 className={headingClass}>Welcome to legalOS.</h1>
        <p className={sublineClass}>
          Your org admin hasn’t granted you access to any departments yet.{" "}
          <a
            href={requestAccessHref}
            className="text-primary underline-offset-4 transition-colors hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Request access from your admin.
          </a>
        </p>
      </section>
    );
  }

  const firstName = getFirstName(profile);

  return (
    <section>
      <h1 className={headingClass}>
        {firstName ? (
          <>
            Welcome back, <span className="text-primary">{firstName}</span>.
          </>
        ) : (
          <>Welcome back.</>
        )}
      </h1>
      <p className={sublineClass}>
        Your team’s departments, knowledge, workflows, and integrations, all in
        one place.
      </p>
    </section>
  );
}
