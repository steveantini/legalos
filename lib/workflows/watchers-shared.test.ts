import { describe, expect, it } from "vitest";

import {
  DEFAULT_WATCHER_WINDOW_DAYS,
  adoptWatcherInputSchema,
  buildWatcherScheduleRow,
  cadenceLabelForSeconds,
  cadenceSecondsFor,
  isWatcherTemplateSlug,
  windowDaysFromRunInput,
} from "./watchers-shared";

const TEMPLATE_ID = "11111111-1111-4111-8111-111111111111";
const COLLECTION_ID = "22222222-2222-4222-8222-222222222222";

describe("adoptWatcherInputSchema", () => {
  it("applies the settled defaults: 60-day window, daily cadence, supervised", () => {
    const parsed = adoptWatcherInputSchema.parse({
      templateId: TEMPLATE_ID,
      collectionId: COLLECTION_ID,
    });
    expect(parsed.windowDays).toBe(DEFAULT_WATCHER_WINDOW_DAYS);
    expect(parsed.windowDays).toBe(60);
    expect(parsed.cadence).toBe("daily");
    expect(parsed.autonomyLevel).toBe("supervised");
  });

  it("bounds the window to [1, 365] whole days", () => {
    const base = { templateId: TEMPLATE_ID, collectionId: COLLECTION_ID };
    expect(adoptWatcherInputSchema.safeParse({ ...base, windowDays: 0 }).success).toBe(false);
    expect(adoptWatcherInputSchema.safeParse({ ...base, windowDays: 366 }).success).toBe(false);
    expect(adoptWatcherInputSchema.safeParse({ ...base, windowDays: 14.5 }).success).toBe(false);
    expect(adoptWatcherInputSchema.safeParse({ ...base, windowDays: 365 }).success).toBe(true);
  });

  it("rejects non-uuid ids and unknown cadences", () => {
    expect(
      adoptWatcherInputSchema.safeParse({
        templateId: "not-a-uuid",
        collectionId: COLLECTION_ID,
      }).success,
    ).toBe(false);
    expect(
      adoptWatcherInputSchema.safeParse({
        templateId: TEMPLATE_ID,
        collectionId: COLLECTION_ID,
        cadence: "hourly",
      }).success,
    ).toBe(false);
  });
});

describe("buildWatcherScheduleRow", () => {
  const input = adoptWatcherInputSchema.parse({
    templateId: TEMPLATE_ID,
    collectionId: COLLECTION_ID,
  });

  it("makes the adopter the owner, starts enabled and immediately due (2c)", () => {
    const row = buildWatcherScheduleRow({
      organizationId: "org-1",
      workflowDefinitionId: "def-1",
      adopterUserId: "user-1",
      input,
      nowIso: "2026-07-02T12:00:00.000Z",
    });
    expect(row.owner_user_id).toBe("user-1");
    expect(row.enabled).toBe(true);
    expect(row.next_run_at).toBe("2026-07-02T12:00:00.000Z");
    expect(row.autonomy_level).toBe("supervised");
  });

  it("stores the cadence preset as seconds and the scan config as run_input (no isFixture)", () => {
    const weekly = adoptWatcherInputSchema.parse({
      templateId: TEMPLATE_ID,
      collectionId: COLLECTION_ID,
      cadence: "weekly",
      windowDays: 30,
    });
    const row = buildWatcherScheduleRow({
      organizationId: "org-1",
      workflowDefinitionId: "def-1",
      adopterUserId: "user-1",
      input: weekly,
      nowIso: "2026-07-02T12:00:00.000Z",
    });
    expect(row.cadence_seconds).toBe(604_800);
    expect(row.run_input).toEqual({
      findingKind: "renewal",
      windowDays: 30,
      collectionId: COLLECTION_ID,
    });
    // Real adoptions are real data: the fixture-only flag never rides along.
    expect("isFixture" in row.run_input).toBe(false);
  });
});

describe("cadence presets and labels", () => {
  it("maps the presets to their seconds", () => {
    expect(cadenceSecondsFor("daily")).toBe(86_400);
    expect(cadenceSecondsFor("weekly")).toBe(604_800);
  });

  it("labels preset seconds by their preset name", () => {
    expect(cadenceLabelForSeconds(86_400)).toBe("Daily");
    expect(cadenceLabelForSeconds(604_800)).toBe("Weekly");
  });

  it("labels a non-preset cadence honestly instead of rounding to a preset", () => {
    expect(cadenceLabelForSeconds(900)).toBe("Every 15 minutes");
    expect(cadenceLabelForSeconds(7_200)).toBe("Every 2 hours");
    expect(cadenceLabelForSeconds(172_800)).toBe("Every 2 days");
  });
});

describe("watcher row display helpers", () => {
  it("recognises the renewal watcher's template slug and nothing else", () => {
    expect(isWatcherTemplateSlug("renewal-watcher")).toBe(true);
    expect(isWatcherTemplateSlug("review-inbound-nda")).toBe(false);
    expect(isWatcherTemplateSlug(null)).toBe(false);
    expect(isWatcherTemplateSlug(undefined)).toBe(false);
  });

  it("reads windowDays defensively from the stored run_input jsonb", () => {
    expect(windowDaysFromRunInput({ windowDays: 60 })).toBe(60);
    expect(windowDaysFromRunInput({ windowDays: "60" })).toBeNull();
    expect(windowDaysFromRunInput({ windowDays: -1 })).toBeNull();
    expect(windowDaysFromRunInput(null)).toBeNull();
    expect(windowDaysFromRunInput("nonsense")).toBeNull();
  });
});
