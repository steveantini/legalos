import type {
  AccessibleDepartment,
  AgentBreadcrumbContext,
} from "@/lib/auth/access";

import { WorkspaceBreadcrumb } from "./workspace-breadcrumb";

/**
 * Top bar of the Aperture Workspace surface.
 *
 * Renders a breadcrumb on the left (route-aware via the
 * `<WorkspaceBreadcrumb>` client island) and the date string on the
 * right. The Aperture spec also calls for a "live agents" pulsing
 * indicator next to the date — hidden in this build per the
 * phantom-data scope rules from 9e.
 *
 * Date is formatted from the server clock with `Intl.DateTimeFormat`
 * to match the spec's "Saturday · May 2" shape (long weekday + long
 * month + numeric day, joined with " · ").
 *
 * `departments` is forwarded to the breadcrumb so it can resolve a
 * `/departments/<slug>` pathname to the department's display name.
 * The layout already fetches this list for the rail; passing it here
 * avoids a duplicate query on the client.
 */
export function WorkspaceTopBar({
  departments,
  agents,
}: {
  departments: AccessibleDepartment[];
  agents: AgentBreadcrumbContext[];
}) {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(now);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
  }).format(now);
  const dateStr = `${weekday} · ${monthDay}`;

  return (
    <div className="flex h-[56px] items-center gap-5 border-b border-hairline px-10">
      <WorkspaceBreadcrumb departments={departments} agents={agents} />
      <div className="ml-auto flex gap-[22px] text-[12.5px] text-caption">
        <span>{dateStr}</span>
      </div>
    </div>
  );
}
