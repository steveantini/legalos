import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { googleCalendarAdapter } from "./google-calendar";

describe("googleCalendarAdapter", () => {
  const prevClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id";
  });
  afterEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = prevClientId;
  });

  it("is an oauth adapter in the calendar category reusing the Google client", () => {
    expect(googleCalendarAdapter.kind).toBe("oauth");
    expect(googleCalendarAdapter.providerId).toBe("google-calendar");
    expect(googleCalendarAdapter.capabilityCategory).toBe("calendar");
    expect(googleCalendarAdapter.clientIdEnvVar).toBe("GOOGLE_OAUTH_CLIENT_ID");
    expect(googleCalendarAdapter.clientSecretEnvVar).toBe("GOOGLE_OAUTH_CLIENT_SECRET");
  });

  it("requests the read-only events scope and nothing that can write", () => {
    expect(googleCalendarAdapter.scopes).toContain(
      "https://www.googleapis.com/auth/calendar.events.readonly",
    );
    // No write/full-calendar scope is requested.
    for (const scope of googleCalendarAdapter.scopes) {
      expect(scope).not.toBe("https://www.googleapis.com/auth/calendar");
      expect(scope).not.toBe("https://www.googleapis.com/auth/calendar.events");
    }
  });

  it("builds an authorization URL with PKCE, offline access, and the scope", () => {
    const raw = googleCalendarAdapter.buildAuthorizationUrl({
      redirectUri: "https://app.example/api/connections/callback",
      state: "signed-state",
      codeChallenge: "challenge123",
    });
    const url = new URL(raw);
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/connections/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge")).toBe("challenge123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("scope")).toContain("calendar.events.readonly");
  });
});
