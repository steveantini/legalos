/**
 * Top bar of the Aperture Workspace landing.
 *
 * Renders the breadcrumb on the left ("workspace / departments") and the
 * date string on the right. The Aperture spec also calls for a "live
 * agents" pulsing indicator next to the date — hidden in this build per
 * the phantom-data scope rules (Session 9e); we don't have a real
 * agents-running counter yet, so the indicator would be ornamental.
 *
 * Date is formatted from the server clock with `Intl.DateTimeFormat` to
 * match the spec's "Saturday · May 2" shape (long weekday + long month
 * + numeric day, joined with " · ").
 */
export function WorkspaceTopBar() {
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
      <div className="text-[13px] text-caption">
        workspace /{" "}
        <strong className="font-medium text-foreground">departments</strong>
      </div>
      <div className="ml-auto flex gap-[22px] text-[12.5px] text-caption">
        <span>{dateStr}</span>
      </div>
    </div>
  );
}
