/**
 * Accent circle with the center's initials (first letters of the first two
 * words). Single-accent: the avatar is a neutral identity affordance rendered in
 * the accent fill per the Figma admin frames. Server-renderable.
 */
export function CenterAvatar({
  name,
  className = "h-10 w-10 text-[13px]",
}: {
  name: string;
  /** Tailwind size + text classes (default = 40px queue avatar). */
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-on ${className}`}
    >
      {initials}
    </span>
  );
}
