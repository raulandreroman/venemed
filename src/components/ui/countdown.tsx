"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  expiryProgress,
  formatRelativeTime,
  formatTimeLeftLong,
} from "@/lib/format";
import { ProgressBar } from "./progress-bar";

/**
 * Live countdown block. Donor detail (Figma 20:2) is red-tinted (`tone="error"`,
 * the default); the center request detail (Figma 29:3527) is accent/blue
 * (`tone="accent"`) — the center is managing its own window, not signaling donor
 * urgency. Big "Vence en N horas" + "Publicado hace N h · ventana de N h" +
 * progress bar; ticks every 30s on the client.
 *
 * `initialNow` is evaluated on the server and passed down so the first client
 * render is byte-identical to the (ISR-cached) server HTML — avoiding a
 * clock-skew hydration mismatch. After mount we switch to the live clock.
 *
 * `windowStart` overrides the progress-bar start (defaults to `publishedAt`).
 * "Extender ventana" resets `expiresAt = now + windowHours` while keeping the
 * true `publishedAt`, so the center detail passes `windowStart = expiresAt -
 * windowHours` to keep the bar reading as a fresh window while "Publicado hace
 * X" stays honest.
 *
 * `action` renders below the bar (e.g. the "+ Extender ventana" button) so the
 * center detail injects it without duplicating the live-tick logic.
 */
export function Countdown({
  publishedAt,
  expiresAt,
  windowHours,
  initialNow,
  tone = "error",
  windowStart,
  action,
}: {
  publishedAt: Date | string | null;
  expiresAt: Date | string | null;
  windowHours: number;
  initialNow: Date | string;
  tone?: "error" | "accent";
  windowStart?: Date | string | null;
  action?: ReactNode;
}) {
  const [now, setNow] = useState(() =>
    initialNow instanceof Date ? initialNow : new Date(initialNow),
  );

  useEffect(() => {
    // First render uses the server-provided `initialNow` (no hydration
    // mismatch); swap to the live clock just after mount — deferred out of the
    // effect body so it doesn't trigger a synchronous cascading render.
    const tick = () => setNow(new Date());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 30_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  const headline = formatTimeLeftLong(expiresAt, now);
  const progress = expiryProgress(windowStart ?? publishedAt, expiresAt, now);

  const isAccent = tone === "accent";
  const container = isAccent ? "bg-accent-subtle" : "bg-error-tint";
  const headlineColor = isAccent ? "text-accent" : "text-error";
  const subColor = isAccent ? "text-accent/80" : "text-error/80";
  const barTone = isAccent ? "accent" : "error";
  const barBg = isAccent ? "bg-accent/15" : "bg-error/15";

  return (
    <div className={`rounded-2xl ${container} p-4`}>
      <p className={`text-xl font-bold ${headlineColor}`}>{headline}</p>
      <p className={`mt-1 text-sm ${subColor}`}>
        Publicado {formatRelativeTime(publishedAt, now)} · ventana de{" "}
        {windowHours} h
      </p>
      <ProgressBar value={progress} tone={barTone} className={`mt-3 ${barBg}`} />
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
