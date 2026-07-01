/** Ratio bar. `value` is 0..1. */
export function ProgressBar({
  value,
  className = "",
  tone = "error",
}: {
  value: number;
  className?: string;
  tone?: "error" | "neutral" | "accent";
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const fill =
    tone === "error" ? "bg-error" : tone === "accent" ? "bg-accent" : "bg-neutral-500";
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-black/10 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
