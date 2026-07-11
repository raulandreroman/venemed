"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recordShare } from "@/app/actions/share";
import { shareWithOptionalImage } from "@/lib/share/native-share";
import {
  buildListaShareText,
  type ListaShareData,
} from "@/lib/listas/share-text";

/** Everything the sheet needs to render the WhatsApp text, minus the absolute
 * URL (resolved client-side from `window.location.origin`). */
export type ShareSheetData = Omit<ListaShareData, "url">;

/**
 * "Compartir · sheet de opciones" (field-insight-whatsapp §4). Shared bottom
 * sheet offering three ways to spread a lista — WhatsApp text, story image,
 * copy link — reused by the donor detail CTA, the center dashboard, and the
 * publicada confirm screen. The trigger button lives in each caller; this is
 * just the panel, driven by open/onClose props.
 *
 * Chrome mirrors the InsumoSelector recipe (neutral scrim, max-w-[390px]
 * rounded-t-[24px] panel, drag handle, Escape + body-scroll-lock + focus-trap).
 * Clipboard / navigator.share are secure-context APIs (gotcha #5) — every option
 * degrades gracefully when unavailable.
 */
export function ShareSheet({
  open,
  onClose,
  listaId,
  path,
  data,
}: {
  open: boolean;
  onClose: () => void;
  listaId: string;
  /** Canonical donor path, e.g. "/listas/<id>". */
  path: string;
  data: ShareSheetData;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"whatsapp" | "link" | null>(null);

  // Resolve the absolute URL + prebuilt WhatsApp text client-side. The panel
  // only renders (open === true) after mount, so `window` is always defined by
  // the time these are read; the SSR guard keeps the hook order stable.
  const url = useMemo(
    () =>
      typeof window !== "undefined"
        ? new URL(path, window.location.origin).toString()
        : "",
    [path],
  );
  const shareText = useMemo(
    () => buildListaShareText({ ...data, url }),
    [data, url],
  );
  const shareMessage = `Ayuda a ${data.centerName} en VeneMed:`;
  const displayUrl = url.replace(/^https?:\/\//, "");

  // Escape + body-scroll-lock + focus-trap while open (InsumoSelector recipe).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === panel)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = getFocusable();
      const active = document.activeElement as HTMLElement | null;
      const first = focusable[0] ?? panel;
      const last = focusable[focusable.length - 1] ?? panel;
      if (e.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  // Reset the transient "Copiado" state whenever the sheet reopens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const raf = requestAnimationFrame(() => setCopied(null));
      return () => cancelAnimationFrame(raf);
    }
    if (!open) wasOpen.current = false;
  }, [open]);

  const flashCopied = useCallback((which: "whatsapp" | "link") => {
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // 1 · WhatsApp text — copy to clipboard; fall back to a text-only native share.
  const onWhatsAppText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      flashCopied("whatsapp");
      recordShare(listaId, "whatsapp").catch(() => {});
    } catch {
      // Clipboard unavailable (insecure context) — try the native sheet.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ text: shareText });
          recordShare(listaId, "whatsapp").catch(() => {});
        } catch {
          // cancelled / unsupported — no-op.
        }
      }
    }
  }, [shareText, listaId, flashCopied]);

  // 2 · Story image — reuse the native file-share flow (attaches the per-lista
  // story PNG); fall back to opening the image URL in a new tab.
  const onImage = useCallback(async () => {
    const result = await shareWithOptionalImage({
      title: shareMessage,
      text: shareMessage,
      url,
    });
    if (result === "cancelled") return;
    if (result === "unsupported") {
      window.open(`${url}/story-image`, "_blank", "noopener,noreferrer");
    }
    // Native sheet hides the chosen app → channel "unknown" (same as the
    // pre-sheet donor CTA).
    recordShare(listaId, "unknown").catch(() => {});
    onClose();
  }, [shareMessage, url, listaId, onClose]);

  // 3 · Copy link — clipboard with brief "Copiado" feedback.
  const onCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      flashCopied("link");
      recordShare(listaId, "copy_link").catch(() => {});
    } catch {
      // Clipboard unavailable (insecure context) — no-op.
    }
  }, [url, listaId, flashCopied]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compartir esta lista"
      className="fixed inset-0 z-40"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[390px] flex-col rounded-t-[24px] bg-surface shadow-xl outline-none"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        {/* header */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-1 pb-3">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">
              Compartir esta lista
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Llega a los donantes donde ya se organizan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
          >
            <CloseIcon />
          </button>
        </div>

        {/* options */}
        <div className="flex flex-col gap-2.5 px-5 pb-8 pt-1">
          <OptionRow
            highlighted
            icon={<ChatIcon />}
            label="Texto para WhatsApp"
            description={
              copied === "whatsapp"
                ? "Copiado"
                : "Lista formateada para difundir"
            }
            confirmed={copied === "whatsapp"}
            onClick={onWhatsAppText}
          />
          <OptionRow
            icon={<ImageIcon />}
            label="Imagen"
            description="Tarjeta para estados o historias"
            onClick={onImage}
          />
          <OptionRow
            icon={<LinkIcon />}
            label="Copiar enlace"
            description={copied === "link" ? "Copiado" : displayUrl}
            confirmed={copied === "link"}
            onClick={onCopyLink}
          />
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  icon,
  label,
  description,
  onClick,
  highlighted = false,
  confirmed = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  highlighted?: boolean;
  confirmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition-colors ${
        highlighted
          ? "bg-accent-subtle hover:bg-accent-subtle/70"
          : "hover:bg-neutral-100"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-surface text-neutral-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-neutral-900">
          {label}
        </span>
        <span
          className={`block truncate text-[13px] ${
            confirmed ? "font-medium text-accent" : "text-neutral-500"
          }`}
        >
          {description}
        </span>
      </span>
      <span className="shrink-0 text-neutral-400" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}

function ChatIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-4.5-4.5L5 21" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="20"
      height="20"
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

function ChevronIcon() {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
