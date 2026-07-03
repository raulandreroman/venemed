"use client";

import { useCallback, useState } from "react";

import { recordShare } from "@/app/actions/share";
import { shareWithOptionalImage } from "@/lib/share/native-share";

/**
 * "Comparte esta solicitud" (Figma 20:2 / 30:16798).
 * Four circular share affordances: WhatsApp / Instagram / X / Copiar link.
 * Each affordance builds its share-intent URL AND records a `share_event` via
 * the `recordShare` server action (fire-and-forget — the share UX never awaits
 * analytics; `.catch(() => {})` swallows a failed RPC so it never surfaces as an
 * unhandled promise rejection).
 * Client Component: needs window.location + navigator.clipboard/share.
 * URLs are resolved at click time so there is no SSR/hydration mismatch.
 */
export function ShareSection({
  requestId,
  title,
  message,
  path,
}: {
  /** Request id, threaded into `recordShare` for the analytics event. */
  requestId: string;
  /** Section title, e.g. "Comparte esta solicitud". */
  title?: string;
  /** Pre-built share text (without the URL). */
  message: string;
  /** Path of the lista, e.g. "/listas/abc". */
  path: string;
}) {
  const [copied, setCopied] = useState(false);
  // Instagram goes through navigator.share, which fetches the share image at
  // tap time — busy state so the tap doesn't feel dead while the PNG loads.
  const [sharingInstagram, setSharingInstagram] = useState(false);

  const absoluteUrl = useCallback(
    () => new URL(path, window.location.origin).toString(),
    [path],
  );

  const open = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const shareWhatsApp = useCallback(() => {
    open(`https://wa.me/?text=${encodeURIComponent(`${message} ${absoluteUrl()}`)}`);
    recordShare(requestId, "whatsapp").catch(() => {});
  }, [open, message, absoluteUrl, requestId]);

  const shareX = useCallback(() => {
    open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        message,
      )}&url=${encodeURIComponent(absoluteUrl())}`,
    );
    recordShare(requestId, "x").catch(() => {});
  }, [open, message, absoluteUrl, requestId]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      recordShare(requestId, "copy_link").catch(() => {});
    } catch {
      // Clipboard unavailable (e.g. insecure context) — no-op.
    }
  }, [absoluteUrl, requestId]);

  const shareInstagram = useCallback(async () => {
    if (sharingInstagram) return;
    setSharingInstagram(true);
    try {
      // Instagram has no web share-intent URL; use the Web Share API when
      // available (attaching the per-lista OG image when the platform supports
      // it), otherwise fall back to copying the link.
      const result = await shareWithOptionalImage({
        title: message,
        text: message,
        url: absoluteUrl(),
      });
      if (result === "shared") {
        recordShare(requestId, "instagram").catch(() => {});
        return;
      }
      if (result === "cancelled") {
        // User dismissed the share sheet — silent, no copy fallback.
        return;
      }
      // No native share available. Fallback records "copy_link" via copyLink.
      void copyLink();
    } finally {
      setSharingInstagram(false);
    }
  }, [sharingInstagram, message, absoluteUrl, copyLink, requestId]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-900">
        {title ?? "Comparte esta solicitud"}
      </h2>

      <div className="mt-4 flex items-start justify-between gap-2">
        <ShareButton
          label="WhatsApp"
          colorClass="bg-[#25D366] text-white"
          onClick={shareWhatsApp}
          icon={<WhatsAppIcon />}
        />
        <ShareButton
          label="Instagram"
          colorClass="bg-[#C13584] text-white"
          onClick={shareInstagram}
          busy={sharingInstagram}
          icon={
            sharingInstagram ? (
              <SpinnerIcon />
            ) : (
              <span className="text-[11px] font-bold leading-none">IG</span>
            )
          }
        />
        <ShareButton
          label="X"
          colorClass="bg-[#0f1419] text-white"
          onClick={shareX}
          icon={<XIcon />}
        />
        <ShareButton
          label={copied ? "Copiado" : "Copiar link"}
          colorClass="bg-accent text-accent-on"
          onClick={copyLink}
          icon={copied ? <CheckIcon /> : <LinkArrowIcon />}
        />
      </div>
    </section>
  );
}

function ShareButton({
  label,
  colorClass,
  icon,
  onClick,
  busy = false,
}: {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex w-16 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-busy={busy}
        disabled={busy}
        className="transition-transform active:scale-95 disabled:opacity-70"
      >
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${colorClass}`}
        >
          {icon}
        </span>
      </button>
      <span className="text-xs text-neutral-700">{label}</span>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.413c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.715zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkArrowIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
