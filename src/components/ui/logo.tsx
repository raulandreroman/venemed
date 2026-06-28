/**
 * VeneMed brand mark (Figma landing 11:3): a rounded accent square containing a
 * white medical cross. The mark is the one *branded* use of accent (brand
 * identity, not an action), so it is exempt from the single-accent action rule.
 * Server-renderable inline SVG.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent ${className}`}
      aria-hidden="true"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M10 3h4a1 1 0 0 1 1 1v5h5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-5v5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-5H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h5V4a1 1 0 0 1 1-1z"
          fill="#ffffff"
        />
      </svg>
    </span>
  );
}
