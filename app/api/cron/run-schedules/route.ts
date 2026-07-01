import {
  buildLiveTickDeps,
  isAuthorizedCronRequest,
  runDueSchedules,
} from "@/lib/workflows/schedule-run";

/**
 * Scheduled-run cron (watcher arc, Stage 1, D-220). Vercel Cron GETs this on a
 * cadence (see vercel.json) carrying `Authorization: Bearer <CRON_SECRET>`. It
 * selects due workflow_schedules and drives each through the headless run core,
 * attributing every run to the schedule's human owner (option 2c).
 *
 * SHIPS DARK: workflow_schedules is empty in Stage 1, so a tick selects zero rows
 * and does nothing. The endpoint is safe to have live before any schedule exists.
 *
 * Auth is fail-closed: with no CRON_SECRET configured (or a wrong/absent bearer),
 * every request is rejected, so the endpoint never runs open.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCronRequest(authHeader, process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runDueSchedules(buildLiveTickDeps());
  return Response.json({ ok: true, ...result });
}
