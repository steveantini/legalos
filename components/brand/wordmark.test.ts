import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";

import { PRODUCT_NAME, Wordmark } from "./wordmark";

const render = (props: { className?: string } = {}) =>
  renderToStaticMarkup(createElement(Wordmark, props));

describe("Wordmark", () => {
  it("renders the product name and forces text-transform: none (an uppercased eyebrow can't flatten it)", () => {
    const html = render();
    expect(html).toContain(siteConfig.siteTitle);
    expect(html).toMatch(/text-transform:\s*none/);
  });

  it("follows a rename of the single source (siteConfig.siteTitle)", () => {
    const original = siteConfig.siteTitle;
    try {
      siteConfig.siteTitle = "NovaLaw";
      expect(render()).toContain("NovaLaw");
      expect(render()).not.toContain("legalOS");
    } finally {
      siteConfig.siteTitle = original;
    }
  });

  it("passes className through for sizing/weight without re-enabling a transform", () => {
    const html = render({ className: "font-medium text-primary" });
    expect(html).toContain("font-medium text-primary");
    expect(html).toMatch(/text-transform:\s*none/);
  });

  it("PRODUCT_NAME exposes the same canonical string for non-node contexts", () => {
    expect(PRODUCT_NAME).toBe(siteConfig.siteTitle);
  });
});
