"use client";

import { useCallback } from "react";

import { Button } from "@/components/ui";

/**
 * Footer primary CTA for an active request: "Compartir solicitud".
 * Sharing is the core donor action (replaces the old "Volver"; back is handled
 * by the AppBar arrow / sheet dismiss).
 *
 * Behavior:
 *  - If `navigator.share` exists → native share sheet with the same message/URL
 *    as the in-page ShareSection.
 *  - Otherwise → scroll to the in-page ShareSection (#comparte) so the donor can
 *    pick a channel.
 */
export function ShareCtaButton({
  message,
  path,
}: {
  message: string;
  path: string;
}) {
  const onClick = useCallback(async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to scroll
      }
    }
    document
      .getElementById("comparte")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message, path]);

  return (
    <Button variant="primary" fullWidth onClick={onClick}>
      Compartir solicitud
    </Button>
  );
}
