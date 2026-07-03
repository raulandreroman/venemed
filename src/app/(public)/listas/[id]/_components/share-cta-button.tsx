"use client";

import { useCallback } from "react";

import { recordShare } from "@/app/actions/share";
import { Button } from "@/components/ui";
import { shareWithOptionalImage } from "@/lib/share/native-share";

/**
 * Footer primary CTA for an active request: "Compartir lista".
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
    // Native share sheet (attaching the per-lista OG image when supported),
    // same message/URL as the in-page ShareSection.
    const result = await shareWithOptionalImage({ title: message, text: message, url });
    if (result === "shared") {
      // Only a successful native share records here (channel unknown). The
      // scroll-to-#comparte fallback records nothing — the channel button the
      // donor then taps in ShareSection is the single recorded event.
      recordShare(requestId, "unknown").catch(() => {});
      return;
    }
    if (result === "cancelled") {
      // User dismissed the share sheet — silent, no scroll.
      return;
    }
    // No native share available — scroll to the in-page channel picker.
    document
      .getElementById("comparte")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [requestId, message, path]);

  return (
    <Button variant="primary" fullWidth onClick={onClick}>
      Compartir este centro
    </Button>
  );
}
