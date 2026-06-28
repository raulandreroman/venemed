"use client";

import { useCallback } from "react";

import { recordShare } from "@/app/actions/share";

import { Button } from "./button";

/**
 * Card "Compartir" affordance (Figma list 30:15714). Client Component so it can
 * reach `navigator.share` / `window.location` and call the `recordShare` server
 * action over RPC. Mirrors `ShareCtaButton`:
 *  - `navigator.share` present → native share sheet, then records channel
 *    "unknown" (the native sheet doesn't tell us which app the user picked).
 *  - Otherwise → navigate to the detail's `#comparte` section so the donor can
 *    pick a channel (which then records the precise channel via ShareSection).
 *
 * No transient state here (the "Copiado" feedback lives in ShareSection), so no
 * setState-in-effect concern.
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
  const onClick = useCallback(async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url });
        // Fire-and-forget; `.catch` swallows a failed RPC (NOT a bare `void`,
        // which would surface the server action's rejection as an unhandled
        // promise rejection). Native sheet → channel unknown.
        recordShare(requestId, "unknown").catch(() => {});
        return;
      } catch {
        // cancelled/unsupported — fall through to the detail's share section
      }
    }
    window.location.href = `${path}#comparte`;
  }, [requestId, message, path]);

  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="flex-1">
      <ShareArrow />
      Compartir
    </Button>
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
