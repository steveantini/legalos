/**
 * The Google Drive logo as a monochrome inline glyph (no new icon dependency;
 * lucide carries no brand mark). `fill="currentColor"` lets it inherit the
 * surrounding text tone, so it reads as a quiet, secondary source marker rather
 * than the loud tri-color brand logo — matching the picker's restrained register
 * while still being recognizably Drive. Functional iconography (it encodes the
 * attachment's source), consistent with the connection state-dot precedent.
 *
 * The path is the standard Drive logo silhouette (viewBox 0 0 87.3 78).
 */
export function GoogleDriveGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 87.3 78"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.79 1.4-1.2 2.95-1.2 4.5h27.5z" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}
