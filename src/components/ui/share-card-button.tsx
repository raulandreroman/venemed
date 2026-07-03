"use client";

import { useCallback, useState } from "react";

import { recordShare } from "@/app/actions/share";
import { shareWithOptionalImage } from "@/lib/share/native-share";

import { Button } from "./button";

/**
 * Card "Compartir" affordance (Figma list 30:15714). Client Component so it can
 * reach `navigator.share` / clipboard and call the `recordShare` server action
 * over RPC. Mirrors `ShareCtaButton`:
 *  - `navigator.share` present → native share sheet with the per-lista story
 *    image attached when supported; records channel "unknown" (the native
 *    sheet doesn't tell us which app the user picked).
 *  - Otherwise (desktop, no Web Share) → copy the link with brief "Copiado"
 *    feedback.
 */
export function ShareCardButton({
  requestId,
  message,
  path,
}: {
  requestId: string;
  message: string;
  path: string;
}) {
  // Busy while the story PNG generates/downloads at tap time.
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = new URL(path, window.location.origin).toString();
      const result = await shareWithOptionalImage({ title: message, text: message, url });
      if (result === "shared") {
        // Fire-and-forget; `.catch` swallows a failed RPC (NOT a bare `void`,
        // which would surface the server action's rejection as an unhandled
        // promise rejection). Native sheet → channel unknown.
        recordShare(requestId, "unknown").catch(() => {});
        return;
      }
      if (result === "cancelled") return;
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
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="flex-1"
      disabled={sharing}
      aria-busy={sharing}
    >
      {sharing ? <SpinnerIcon /> : <ShareArrow />}
      {sharing ? "Preparando…" : copied ? "Copiado" : "Compartir"}
    </Button>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Up-right arrow used on the "Compartir" affordance (Figma list 30:15714). */
function ShareArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
