"use client";

import { useCallback, useState } from "react";

import { recordShare } from "@/app/actions/share";
import { Button } from "@/components/ui";

/**
 * Share block for the "Solicitud publicada" screen (Figma 32:5064): one big
 * brand-green "Compartir por WhatsApp" + a 2-col "Copiar enlace" / "Más" row.
 * Borrows ShareSection's logic (wa.me intent, clipboard with "Copiado"
 * feedback, navigator.share, fire-and-forget recordShare). The green
 * intentionally breaks the single-accent rule — brand color, same #25D366 as
 * ShareSection. All URLs resolve at click time (no SSR/hydration mismatch).
 */
export function PublishedShare({
  requestId,
  message,
  path,
}: {
  requestId: string;
  message: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);

  const absoluteUrl = useCallback(
    () => new URL(path, window.location.origin).toString(),
    [path],
  );

  const shareWhatsApp = useCallback(() => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${message} ${absoluteUrl()}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
    recordShare(requestId, "whatsapp").catch(() => {});
  }, [message, absoluteUrl, requestId]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      recordShare(requestId, "copy_link").catch(() => {});
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  }, [absoluteUrl, requestId]);

  const shareMore = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: message, text: message, url: absoluteUrl() });
        recordShare(requestId, "unknown").catch(() => {});
        return;
      } catch {
        // cancelled/unsupported — fall through to copy
      }
    }
    void copyLink();
  }, [message, absoluteUrl, copyLink, requestId]);

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        fullWidth
        onClick={shareWhatsApp}
        className="bg-[#25D366] text-white hover:bg-[#1ebe5b] active:bg-[#1ebe5b]"
      >
        <WhatsAppIcon />
        Compartir por WhatsApp
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={copyLink}>
          <LinkIcon />
          {copied ? "Copiado" : "Copiar enlace"}
        </Button>
        <Button type="button" variant="outline" onClick={shareMore}>
          <DotsIcon />
          Más
        </Button>
      </div>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.413c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.715zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
