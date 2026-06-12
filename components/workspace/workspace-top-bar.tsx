import type {
  AccessibleDepartment,
  AgentBreadcrumbContext,
} from "@/lib/auth/access";

import { LocalDate } from "./local-date";
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
 * The date is the `<LocalDate>` client island (the user's browser clock,
 * "Saturday · May 2" shape): a server-clock render is UTC on Vercel and
 * showed tomorrow's date during US evenings.
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
  return (
    <div className="flex h-[56px] items-center gap-5 border-b border-hairline px-10">
      <WorkspaceBreadcrumb departments={departments} agents={agents} />
      <div className="ml-auto flex gap-[22px] text-[12.5px] text-caption">
        <LocalDate variant="long" />
      </div>
    </div>
  );
}
