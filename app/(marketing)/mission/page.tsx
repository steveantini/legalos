import type { Metadata } from "next";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingSection,
} from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Our Mission",
  description:
    "To give legal teams the most capable AI workspace available today, on a foundation that keeps them in control of their models, their tools, and their data.",
};

export default function MissionPage() {
  return (
    <MarketingPageShell
      label="Company · Our Mission"
      title="Our Mission"
      lead="To give legal teams the most capable AI workspace available today, built on a foundation that keeps them in control of their models, their tools, and their data, both now and as legal work moves toward something far more powerful."
    >
      <MarketingSection title="Useful now">
        <p>
          A mission that only describes the future is a promise with nothing
          behind it. legalOS earns its place by solving real problems today.
          A legal team can stand up a department of AI specialists, connect
          the systems it already uses, and build workflows that do multi-step
          legal work under human approval, with a complete record of
          everything that happened. That is live, in the product, now. The
          future we are building toward has to rest on something useful in
          the present, and it does.
        </p>
      </MarketingSection>

      <MarketingSection title="Built for where this is going">
        <p>
          The direction of legal AI is becoming clear. Legal teams will not
          accept being locked to a single vendor’s model, both because the
          frontier moves quickly and because the cost of running these models
          falls dramatically year over year. They will want genuine control
          and agency over the tools and technology they depend on. And above
          all, for work this sensitive, they will treat security and privacy
          as non-negotiable. legalOS is built on those three commitments from
          the foundation up: model-agnostic, so you are never locked in;
          control-first, so the tools answer to you; and private by design,
          so the data boundary is yours to set.
        </p>
      </MarketingSection>

      <MarketingSection title="The shape of what is coming">
        <p>
          Picture a legal department that hands a new hire a laptop with
          access to legalOS and, alongside it, a small server prepared in
          advance, running an open-weight model the department chose. The
          work happens through one familiar workspace, while the model and
          the data behind it stay local, private, and entirely under the
          organization’s control. No dependence on a single outside provider.
          No confidential matter leaving the building. That is sovereign
          legal AI: the flexibility to use the best models, the control to
          run them on your terms, and the security of knowing your data never
          left your hands. The architecture of legalOS is already built for
          that future. We are walking toward it deliberately, one honest step
          at a time.
        </p>
      </MarketingSection>

      <MarketingClosing>
        The mission is to make that future ordinary, and to be useful every
        day on the way there.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
