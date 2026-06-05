import { describe, expect, it } from "vitest";

import { vendorContentEnabledFromSettings } from "./content-settings";

describe("vendorContentEnabledFromSettings (default-permit)", () => {
  it("is ENABLED when the provider has no setting row (default-permit)", () => {
    expect(vendorContentEnabledFromSettings({}, "claude-for-legal")).toBe(true);
  });

  it("is ENABLED when a row says enabled: true", () => {
    const settings = {
      "claude-for-legal": { enabled: true, lastRefreshedAt: null },
    };
    expect(vendorContentEnabledFromSettings(settings, "claude-for-legal")).toBe(
      true,
    );
  });

  it("is DISABLED only when a row explicitly says enabled: false", () => {
    const settings = {
      "claude-for-legal": { enabled: false, lastRefreshedAt: null },
    };
    expect(vendorContentEnabledFromSettings(settings, "claude-for-legal")).toBe(
      false,
    );
  });

  it("does not let one disabled provider affect another (default-permit for the other)", () => {
    const settings = {
      "claude-for-legal": { enabled: false, lastRefreshedAt: null },
    };
    expect(vendorContentEnabledFromSettings(settings, "openai-legal")).toBe(true);
  });
});
