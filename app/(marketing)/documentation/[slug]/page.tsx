import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  MarketingClosing,
  MarketingPageShell,
  MarketingProseLink,
} from "@/components/marketing/marketing-page";
import { DOC_PAGES, getDocPage } from "@/lib/marketing/documentation";

/**
 * One documentation guide (Documentation arc Step 1, D-158): the shared
 * marketing shell rendering an entry from lib/marketing/documentation.tsx.
 * Adding a guide is one entry in that module; this route, the hub, and the
 * navigation pick it up. Statically generated from the known slugs; an
 * unknown slug is a 404.
 */

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return { title: "Documentation" };
  return { title: `${page.title} · Documentation`, description: page.summary };
}

export default async function DocumentationGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();

  return (
    <MarketingPageShell
      label={`Documentation · ${page.audience}`}
      title={page.title}
      lead={page.lead}
    >
      {page.body}

      <MarketingClosing>
        <MarketingProseLink href="/documentation">
          All documentation
        </MarketingProseLink>{" "}
        · Everything above describes the product as it ships today. If
        something here doesn&rsquo;t match what you see,{" "}
        <MarketingProseLink href="/contact">tell us</MarketingProseLink>.
      </MarketingClosing>
    </MarketingPageShell>
  );
}
