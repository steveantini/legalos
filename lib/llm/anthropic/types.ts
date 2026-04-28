/**
 * Hand-written narrow types for the Phase 2 chat-runtime tables.
 *
 * Phase 1 followed the same hand-typed pattern (no Supabase CLI–generated
 * types yet); a dedicated session will introduce `supabase gen types
 * typescript` later — see DECISION_LOG D-023's TS-types note. Until then,
 * these types must be kept in sync by hand with supabase/migrations/
 * 0004_native_agents.sql and the agents table from 0001.
 */

export type MessageRole = "user" | "assistant" | "system";

export type Conversation = {
  id: string;
  organization_id: string;
  user_id: string;
  agent_id: string;
  system_prompt_snapshot: string;
  model_snapshot: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  updated_at: string;
};

export type UsageEvent = {
  id: string;
  organization_id: string;
  user_id: string;
  agent_id: string;
  conversation_id: string | null;
  message_id: string | null;
  model: string;
  tokens_in: number;
  tokens_out: number;
  /**
   * bigint values are serialized as strings by PostgREST. Keep the wire type
   * here so callers don't accidentally lose precision converting to Number.
   */
  cost_micro_usd: string;
  created_at: string;
  updated_at: string;
};

/**
 * Subset of the agents row the chat runtime needs. Other agent columns
 * (external_url, category, sort_order, etc.) are intentionally omitted —
 * native-agent code paths must never read them.
 */
export type NativeAgent = {
  id: string;
  organization_id: string;
  department_id: string;
  slug: string;
  name: string;
  type: "native";
  system_prompt: string;
  model: string;
  is_active: boolean;
};
