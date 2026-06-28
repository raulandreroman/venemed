/** Elapsed/window ratio bar. `value` is 0..1 (use expiryProgress() to compute). */
export function ProgressBar({
  value,
  className = "",
  tone = "urgent",
}: {
  value: number;
  className?: string;
  tone?: "urgent" | "neutral";
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const fill = tone === "urgent" ? "bg-urgent" : "bg-neutral-400";
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
