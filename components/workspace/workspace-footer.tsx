import packageJson from "../../package.json";

/**
 * Footer of the Aperture Workspace landing.
 *
 * Left side: command-palette + shortcut-hint copy from the spec. The
 * keyboard shortcuts are visual-only in this build — there is no
 * command palette wired up yet (out of scope per Session 9e plan).
 *
 * Right side: "privilege enforced" + version label. Spec showed
 * "build 26.04" which was a prototype placeholder; we read the
 * `package.json` version at build time so the label tracks the project
 * version automatically.
 */
export function WorkspaceFooter() {
  const version = `v${packageJson.version}`;

  return (
    <div className="flex h-[36px] items-center gap-6 border-t border-hairline px-10 font-mono text-[11px] tracking-[0.04em] text-caption">
      <span>
        ⌘K to command &nbsp;&nbsp; ⌘1 workspace · ⌘M matters · ⌘I inbox
      </span>
      <div className="ml-auto flex gap-[22px]">
        <span>privilege enforced</span>
        <span>{version}</span>
      </div>
    </div>
  );
}
