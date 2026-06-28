"use client";

import { useEffect, useState } from "react";

import {
  expiryProgress,
  formatRelativeTime,
  formatTimeLeftLong,
} from "@/lib/format";
import { ProgressBar } from "./progress-bar";

/**
 * Live countdown block for the active detail view (Figma 20:2).
 * Red-tinted: big "Vence en N horas" + "Publicado hace N h · ventana de N h"
 * + progress bar. Ticks every 30s on the client.
 *
 * `initialNow` is evaluated on the server and passed down so the first client
 * render is byte-identical to the (ISR-cached) server HTML — avoiding a
 * clock-skew hydration mismatch. After mount we switch to the live clock.
 */
export function Countdown({
  publishedAt,
  expiresAt,
  windowHours,
  initialNow,
}: {
  publishedAt: Date | string | null;
  expiresAt: Date | string | null;
  windowHours: number;
  initialNow: Date | string;
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
  const progress = expiryProgress(publishedAt, expiresAt, now);

  return (
    <div className="rounded-2xl bg-error-tint p-4">
      <p className="text-xl font-bold text-error">{headline}</p>
      <p className="mt-1 text-sm text-error/80">
        Publicado {formatRelativeTime(publishedAt, now)} · ventana de{" "}
        {windowHours} h
      </p>
      <ProgressBar value={progress} className="mt-3 bg-error/15" />
    </div>
  );
}
