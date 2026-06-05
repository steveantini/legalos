#!/usr/bin/env tsx
/**
 * One-shot import: load Claude-for-Legal plugin SKILL.md files and
 * insert them as agent rows in legalOS.
 *
 * Usage:
 *   npm run import-c4l -- --plugin=commercial-legal --department=commercial
 *
 * Requirements:
 *   - The C4L repo must be cloned at ../claude-for-legal (sibling to legalos).
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set
 *     in .env.local (the script loads via dotenv).
 *   - The target department must exist in the database with a slug
 *     matching the --department argument.
 *
 * Behavior:
 *   - Reads every SKILL.md under <c4l>/<plugin>/skills/<skill-name>/SKILL.md.
 *   - Parses YAML frontmatter and Markdown body via gray-matter.
 *   - Upserts each as an agent row keyed on (organization_id, slug),
 *     setting is_template=true, created_by=null, and source_origin=
 *     "claude-for-legal:<plugin>/<skill>".
 *   - Reports per-skill status (inserted / updated / failed) to stdout
 *     plus a summary at the end. Exits 0 on success, 1 on any failure.
 *
 * This is the Shape A one-shot path; a Shape B sync pipeline (GitHub
 * Action) replaces it later. Rerunning is safe — the upsert keeps rows
 * consistent without creating duplicates.
 *
 * SUPERSEDED for refreshes by `lib/content/c4l-import.ts` (C4L/platform arc
 * Step 2): this one-shot CLI sets is_active=true unconditionally, so re-running
 * it would RESURRECT skills the operator soft-deleted via the 0024-style filter
 * migrations, and it places agents from the --department arg rather than the
 * persisted plugin→department map. Do NOT use this for a refresh — use the
 * refresh-safe `importC4LContent` (curation-respecting, placement-preserving),
 * which Step 3's platform-owner button will call. This script remains only as a
 * manual first-import escape hatch.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import matter from "gray-matter";

config({ path: resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  plugin: string;
  departmentSlug: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let plugin: string | undefined;
  let departmentSlug: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--plugin=")) plugin = arg.slice("--plugin=".length);
    if (arg.startsWith("--department=")) {
      departmentSlug = arg.slice("--department=".length);
    }
  }

  if (!plugin || !departmentSlug) {
    console.error(
      "Usage: npm run import-c4l -- --plugin=<name> --department=<slug>",
    );
    console.error(
      "Example: npm run import-c4l -- --plugin=commercial-legal --department=commercial",
    );
    process.exit(1);
  }

  return { plugin, departmentSlug };
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

function resolvePluginPath(plugin: string): string {
  const c4lRoot = resolve(process.cwd(), "..", "claude-for-legal");
  const pluginRoot = join(c4lRoot, plugin);
  const skillsRoot = join(pluginRoot, "skills");

  if (!existsSync(c4lRoot)) {
    console.error(`Error: C4L repo not found at ${c4lRoot}.`);
    console.error(
      "Expected ../claude-for-legal as a sibling of the legalos repo.",
    );
    process.exit(1);
  }
  if (!existsSync(pluginRoot)) {
    console.error(`Error: Plugin '${plugin}' not found at ${pluginRoot}.`);
    process.exit(1);
  }
  if (!existsSync(skillsRoot)) {
    console.error(`Error: No 'skills' directory inside ${pluginRoot}.`);
    process.exit(1);
  }

  return skillsRoot;
}

// ---------------------------------------------------------------------------
// SKILL.md parsing
// ---------------------------------------------------------------------------

interface ParsedSkill {
  /** Directory name under skills/ (e.g. "vendor-agreement-review"). */
  skillName: string;
  /** Frontmatter `name` — the agent's display name. */
  frontmatterName: string;
  /** First paragraph of frontmatter `description`. */
  description: string;
  /** Full markdown body after the frontmatter — the agent's system prompt. */
  body: string;
  /** Frontmatter `user-invocable` (defaults to true when absent). */
  userInvocable: boolean;
}

async function readSkill(
  skillsRoot: string,
  skillName: string,
): Promise<ParsedSkill | null> {
  const skillFile = join(skillsRoot, skillName, "SKILL.md");
  if (!existsSync(skillFile)) {
    console.warn(`Skipping ${skillName}: no SKILL.md found.`);
    return null;
  }

  const raw = await readFile(skillFile, "utf-8");
  const parsed = matter(raw);

  const frontmatterName = (parsed.data.name as string | undefined)?.trim();
  const description = (
    (parsed.data.description as string | undefined) ?? ""
  ).trim();
  const userInvocable = parsed.data["user-invocable"] !== false;

  if (!frontmatterName) {
    console.warn(`Skipping ${skillName}: missing 'name' in frontmatter.`);
    return null;
  }

  const firstParagraph = description.split(/\n\s*\n/)[0]?.trim() ?? "";

  return {
    skillName,
    frontmatterName,
    description: firstParagraph,
    body: parsed.content.trim(),
    userInvocable,
  };
}

async function readAllSkills(skillsRoot: string): Promise<ParsedSkill[]> {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const skills: ParsedSkill[] = [];
  for (const skillName of directories) {
    const skill = await readSkill(skillsRoot, skillName);
    if (skill) skills.push(skill);
  }
  return skills;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

// The Supabase client is typed against the schema-less generic; we cast
// `data` to its shape at each call site rather than wiring full Database
// types for a one-shot script.
type ServiceClient = ReturnType<typeof createClient>;

function createServiceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Error: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set in .env.local.",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function lookupOrgId(supabase: ServiceClient): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    console.error("Error looking up organization:", error);
    process.exit(1);
  }
  return (data as { id: string }).id;
}

async function lookupDepartmentId(
  supabase: ServiceClient,
  slug: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", slug)
    .single();
  if (error || !data) {
    console.error(`Error: department '${slug}' not found.`);
    process.exit(1);
  }
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Agent row construction + upsert
// ---------------------------------------------------------------------------

interface AgentRow {
  organization_id: string;
  department_id: string;
  slug: string;
  name: string;
  description: string;
  type: "native";
  model: string;
  system_prompt: string;
  is_template: boolean;
  is_active: boolean;
  created_by: null;
  source_origin: string;
  sort_order: number;
  tools_enabled: string[];
  default_output_format: string;
}

function buildAgentRow(
  skill: ParsedSkill,
  index: number,
  orgId: string,
  deptId: string,
  plugin: string,
): AgentRow {
  return {
    organization_id: orgId,
    department_id: deptId,
    slug: `c4l-${plugin}-${skill.skillName}`,
    name: skill.frontmatterName,
    description: skill.description,
    type: "native",
    model: "anthropic/claude-sonnet-4-6",
    system_prompt: skill.body,
    is_template: true,
    is_active: true,
    created_by: null,
    source_origin: `claude-for-legal:${plugin}/${skill.skillName}`,
    sort_order: 100 + index,
    tools_enabled: [],
    default_output_format: "markdown",
  };
}

async function upsertAgent(
  supabase: ServiceClient,
  row: AgentRow,
): Promise<"inserted" | "updated"> {
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("slug", row.slug)
    .maybeSingle();

  const wasExisting = !!existing;

  // Cast to `never` matches the schema-less client's upsert signature.
  const { error } = await supabase
    .from("agents")
    .upsert(row as unknown as never, { onConflict: "organization_id,slug" });

  if (error) {
    throw new Error(`Failed to upsert ${row.slug}: ${error.message}`);
  }

  return wasExisting ? "updated" : "inserted";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { plugin, departmentSlug } = parseArgs();
  const skillsRoot = resolvePluginPath(plugin);
  const supabase = createServiceClient();

  console.log(
    `Importing C4L plugin '${plugin}' into department '${departmentSlug}'...`,
  );

  const [orgId, deptId, skills] = await Promise.all([
    lookupOrgId(supabase),
    lookupDepartmentId(supabase, departmentSlug),
    readAllSkills(skillsRoot),
  ]);

  console.log(`Found ${skills.length} skills to import.`);
  console.log("");

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const row = buildAgentRow(skill, i, orgId, deptId, plugin);
    try {
      const result = await upsertAgent(supabase, row);
      const marker = result === "inserted" ? "✓ inserted" : "↻ updated";
      console.log(`  ${marker}  ${row.slug}`);
      if (result === "inserted") inserted++;
      else updated++;
    } catch (err) {
      console.error(`  ✗ failed    ${row.slug}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log("");
  console.log(
    `Summary: ${inserted} inserted, ${updated} updated, ${failed} failed.`,
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
