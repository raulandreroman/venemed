"use client";

import { useCallback, useState } from "react";

import { recordShare } from "@/app/actions/share";
import { Button } from "@/components/ui";
import { shareWithOptionalImage } from "@/lib/share/native-share";

/**
 * Footer primary CTA for an active request: "Compartir esta lista".
 * Sharing is the core donor action (replaces the old "Volver"; back is handled
 * by the AppBar arrow / sheet dismiss).
 *
 * Behavior:
 *  - If `navigator.share` exists → native share sheet (attaching the story
 *    image when supported) with the same message/URL.
 *  - Otherwise (desktop, no Web Share) → copy the link with brief "Enlace
 *    copiado" feedback. (The in-page ShareSection was removed — this CTA is
 *    the single donor share affordance.)
 */
export function ShareCtaButton({
  requestId,
  message,
  path,
}: {
  requestId: string;
  message: string;
  path: string;
}) {
  // The share image is fetched at tap time — surface a busy state so the tap
  // doesn't feel dead while the PNG generates/downloads.
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = new URL(path, window.location.origin).toString();
      // Native share sheet (attaching the per-lista story image when supported).
      const result = await shareWithOptionalImage({ title: message, text: message, url });
      if (result === "shared") {
        // Native sheet doesn't reveal the chosen app → channel "unknown".
        recordShare(requestId, "unknown").catch(() => {});
        return;
      }
      if (result === "cancelled") {
        // User dismissed the share sheet — silent.
        return;
      }
      // No native share available — copy the link instead.
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        recordShare(requestId, "copy_link").catch(() => {});
      } catch {
        // Clipboard unavailable (e.g. insecure context) — no-op.
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, requestId, message, path]);

  return (
    <Button variant="primary" fullWidth onClick={onClick} disabled={sharing} aria-busy={sharing}>
      {sharing && <SpinnerIcon />}
      {sharing ? "Preparando…" : copied ? "Enlace copiado" : "Compartir esta lista"}
    </Button>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
