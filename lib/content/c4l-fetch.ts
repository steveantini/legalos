import matter from "gray-matter";

import type { ParsedC4LSkill } from "@/lib/content/c4l-import";
import type { VendorContentProvider } from "@/lib/content/vendor-registry";

/**
 * Runtime fetch + parse of C4L content from the PUBLIC GitHub repo (C4L/platform
 * arc, Step 3). Feeds the safe `importC4LContent` (Step 2). No auth/token: the
 * repo is public.
 *
 * FETCH STRATEGY (API-frugal, stays well under the ~60 req/hr unauthenticated
 * GitHub API limit): TWO GitHub API calls total per refresh —
 *   1. GET /repos/<owner>/<repo>            → the default branch.
 *   2. GET /git/trees/<branch>?recursive=1  → the ENTIRE file tree in one call.
 * Then each mapped plugin's SKILL.md is read from raw.githubusercontent.com,
 * which is a CDN and is NOT subject to the API rate limit. So a refresh costs 2
 * API calls regardless of how many skills exist — a manual button can't realistically
 * exhaust 60/hr. (Both hosts are on the deployment's network allowlist.)
 *
 * The strict path shape `^<plugin>/skills/<skill>/SKILL.md$` is the filter: it
 * matches only first-party plugin skills and naturally EXCLUDES
 * external_plugins/<vendor>/skills/... (an extra path segment),
 * managed-agent-cookbooks, and non-plugin dirs (.claude-plugin, scripts,
 * references). Content is fetched only for MAPPED plugins; every first-party
 * plugin found is reported in `repoPlugins` so the caller can surface upstream
 * plugins we don't map (the operator's uncategorized-content concern).
 *
 * NEVER throws: every failure (rate limit, network, truncated tree) returns a
 * typed `{ ok: false, error }` with a calm, user-safe message.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
/** `<plugin>/skills/<skill>/SKILL.md` — first-party plugin skills only. */
const SKILL_PATH_RE = /^([^/]+)\/skills\/([^/]+)\/SKILL\.md$/;
/** Polite light batching for the raw (CDN) reads. */
const RAW_BATCH_SIZE = 8;

/** The fetcher's outcome. `repoPlugins` = every first-party plugin slug found. */
export type C4LFetchResult =
  | { ok: true; skills: ParsedC4LSkill[]; repoPlugins: string[] }
  | { ok: false; error: string };

/** A PII-safe summary of one refresh, for the platform-owner UI (Step 3). */
export type C4LRefreshSummary = {
  /** New agents inserted this refresh. */
  insertedCount: number;
  /** Department slugs that received new agents. */
  insertedDepartments: string[];
  /** Existing rows skipped because the operator had filtered them (protected). */
  skippedFilteredCount: number;
  /** Upstream first-party plugins with no department mapping — reported, not imported. */
  unmappedPlugins: string[];
  /** Existing agents whose upstream content drifted — reported, not applied. */
  updatesAvailableCount: number;
  /** Existing agents already matching upstream — nothing to do. */
  unchangedCount: number;
};

/** The server action's result the client renders. */
export type C4LRefreshResult =
  | { ok: true; summary: C4LRefreshSummary }
  | { ok: false; error: string };

/** Parse `https://github.com/<owner>/<repo>` into its parts. */
function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(repoUrl);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Parse one SKILL.md into a ParsedC4LSkill, matching the original CLI import's
 * gray-matter parse EXACTLY (name; description = first paragraph of the
 * frontmatter description; system prompt = the markdown body), so a refresh's
 * content compares apples-to-apples against the originally-imported agents and
 * doesn't report spurious drift. Returns null when the frontmatter has no name.
 * Pure (string in, struct out) — unit-tested.
 */
export function parseC4LSkillMarkdown(
  plugin: string,
  skill: string,
  raw: string,
): ParsedC4LSkill | null {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch {
    return null;
  }
  const name = (parsed.data.name as string | undefined)?.trim();
  if (!name) return null;
  const description = ((parsed.data.description as string | undefined) ?? "").trim();
  const firstParagraph = description.split(/\n\s*\n/)[0]?.trim() ?? "";
  return {
    plugin,
    skill,
    name,
    description: firstParagraph,
    systemPrompt: parsed.content.trim(),
  };
}

/** A GitHub API GET with the required headers; never throws (caller handles). */
async function githubApiGet(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      // GitHub requires a User-Agent on API requests.
      "User-Agent": "legalOS-content-refresh",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    // Always read fresh upstream state on a manual refresh.
    cache: "no-store",
  });
}

/** A calm, user-safe message for a failed GitHub API response. */
function apiErrorMessage(res: Response): string {
  if (res.status === 403 || res.status === 429) {
    return "The source service is rate limiting requests right now. Please try again in a little while.";
  }
  if (res.status === 404) {
    return "The source repository could not be found. It may have moved.";
  }
  return "Couldn't read the source repository. Please try again.";
}

/**
 * Fetch + parse the C4L skills for the provider's MAPPED plugins, and report
 * every first-party plugin slug present upstream. Never throws.
 */
export async function fetchC4LSkills(
  provider: VendorContentProvider,
): Promise<C4LFetchResult> {
  const parsedRepo = parseRepoUrl(provider.sourceRepo);
  if (!parsedRepo) {
    return { ok: false, error: "The source repository is not configured correctly." };
  }
  const { owner, repo } = parsedRepo;

  try {
    // 1. Default branch.
    const metaRes = await githubApiGet(`${GITHUB_API}/repos/${owner}/${repo}`);
    if (!metaRes.ok) return { ok: false, error: apiErrorMessage(metaRes) };
    const meta = (await metaRes.json()) as { default_branch?: string };
    const branch = meta.default_branch ?? "main";

    // 2. The whole tree in one call.
    const treeRes = await githubApiGet(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    if (!treeRes.ok) return { ok: false, error: apiErrorMessage(treeRes) };
    const tree = (await treeRes.json()) as {
      truncated?: boolean;
      tree?: Array<{ path: string; type: string }>;
    };
    if (tree.truncated) {
      return {
        ok: false,
        error: "The source repository is too large to read in one pass right now. Please try again later.",
      };
    }

    // Identify first-party plugin skills; collect mapped ones to fetch.
    const repoPlugins = new Set<string>();
    const toFetch: Array<{ plugin: string; skill: string; path: string }> = [];
    for (const entry of tree.tree ?? []) {
      if (entry.type !== "blob") continue;
      const m = SKILL_PATH_RE.exec(entry.path);
      if (!m) continue;
      const [, plugin, skill] = m;
      repoPlugins.add(plugin);
      if (plugin in provider.pluginDepartmentMap) {
        toFetch.push({ plugin, skill, path: entry.path });
      }
    }

    // 3. Read each mapped SKILL.md from the raw CDN (not API-rate-limited),
    //    in light batches. A single file failing is skipped, not fatal.
    const skills: ParsedC4LSkill[] = [];
    for (let i = 0; i < toFetch.length; i += RAW_BATCH_SIZE) {
      const batch = toFetch.slice(i, i + RAW_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async ({ plugin, skill, path }) => {
          try {
            const rawRes = await fetch(
              `${GITHUB_RAW}/${owner}/${repo}/${branch}/${path
                .split("/")
                .map(encodeURIComponent)
                .join("/")}`,
              { cache: "no-store" },
            );
            if (!rawRes.ok) return null;
            return parseC4LSkillMarkdown(plugin, skill, await rawRes.text());
          } catch {
            return null;
          }
        }),
      );
      for (const parsed of results) {
        if (parsed) skills.push(parsed);
      }
    }

    return { ok: true, skills, repoPlugins: [...repoPlugins].sort() };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the source repository. Check the connection and try again.",
    };
  }
}
