import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  defaultTaskBookConfig,
  parseTaskBookConfig,
  type TaskBookConfig,
} from "./types";

/**
 * Loads the org's persisted task book (productivity calculator Step A). One row
 * per org (migration 0069), RLS-scoped to the caller's org. Returns the empty
 * default book when nothing is saved yet, when the stored JSON fails validation,
 * or before the migration is applied (a read error) — never throws, so the
 * calculator always renders.
 */
export async function getTaskBook(): Promise<TaskBookConfig> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("productivity_task_book")
      .select("config")
      .maybeSingle();

    if (error || !data) return defaultTaskBookConfig();
    return parseTaskBookConfig(data.config) ?? defaultTaskBookConfig();
  } catch {
    return defaultTaskBookConfig();
  }
}
