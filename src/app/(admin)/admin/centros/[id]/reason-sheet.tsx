"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui";

/**
 * Shared modal chrome for the moderation reason sheets (reject / suspend).
 * Owns the bottom-sheet overlay (mirrors the donor request-sheet chrome: scrim +
 * Esc/backdrop close + focus trap + body scroll lock) and the Cancelar/confirm
 * footer. Each caller supplies its own title, explainer, and form body via
 * `children`. Extracted so suspend reuses the chrome instead of duplicating it.
 */
export function ReasonSheet({
  ariaLabel,
  title,
  subtitle,
  children,
  error,
  submitLabel,
  submittingLabel,
  submitDisabled,
  submitting,
  onSubmit,
  onClose,
}: {
  ariaLabel: string;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  error: string | null;
  submitLabel: string;
  submittingLabel: string;
  submitDisabled: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc to close + body scroll lock + focus trap while open.
  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = getFocusable();
      const first = focusable[0] ?? panel;
      const last = focusable[focusable.length - 1] ?? panel;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
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
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50"
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
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-[24px] bg-surface shadow-xl outline-none"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4">
          <h2 className="text-2xl font-bold text-neutral-900">{title}</h2>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>

          {children}

          {error && (
            <p role="alert" className="mt-2 text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-neutral-100 bg-surface px-5 pb-5 pt-3">
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={submitting}
            onClick={onClose}
            className="border-[1.5px] border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-50"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            fullWidth
            disabled={submitDisabled || submitting}
            onClick={onSubmit}
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
