import type { Metadata } from "next";

import { FeedbackReview } from "@/components/platform/feedback/feedback-review";
import { listFeedback } from "@/lib/feedback/data";

export const metadata: Metadata = {
  title: "Feedback",
};

/**
 * Platform → Feedback (in-product feedback foundation, Step One). The cross-org
 * queue of notes customers sent from inside the app. Gated by the platform
 * layout's requirePlatformOwner() (a non-owner, including an org super_admin,
 * gets a 404). Reads via the service-role admin client inside the data layer
 * (the operator-analytics cross-org pattern), since feedback has no user SELECT
 * policy. force-dynamic so the queue and its statuses are always live.
 */
export const dynamic = "force-dynamic";

export default async function PlatformFeedbackPage() {
  const items = await listFeedback();

  return (
    <>
      <header>
        <h1 className="text-[44px] font-normal leading-[1.02] tracking-[-0.03em] text-foreground">
          Feedback
        </h1>
        <p className="mt-[14px] max-w-[60ch] text-[14.5px] leading-[1.5] text-muted-foreground">
          Notes customers send from inside the app, with the context they were
          in. Read each one, and move it along as you act on it.
        </p>
      </header>

      <div className="mt-10">
        <FeedbackReview items={items} />
      </div>
    </>
  );
}
