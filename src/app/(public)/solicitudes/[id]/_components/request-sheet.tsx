"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Bottom-sheet chrome (Figma 30:16798) for the intercepted detail route.
 * Opened when navigating to /solicitudes/[id] from the list; dismissing
 * (scrim click, Escape, back button) returns to the list. A direct visit /
 * refresh renders the full page instead (the non-intercepted route).
 *
 * Content + footer are Server Components passed through as props, so the detail
 * stays SSR/ISR-fed with no client refetch.
 */
export function RequestSheet({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => router.back(), [router]);

  // Escape to dismiss + lock body scroll + trap focus while the sheet is open.
  useEffect(() => {
    const panel = panelRef.current;
    // Restore focus to whatever was focused before the sheet opened (the card).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null || el === panel)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Trap Tab within the panel so focus never reaches the list behind the scrim.
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

    // Focus the panel container itself (not the first focusable child) with
    // preventScroll, and reset the scroll position to the top — otherwise
    // focusing an element lower in the content opens the sheet scrolled down.
    panel?.focus({ preventScroll: true });
    const scroller = panel?.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (scroller) scroller.scrollTop = 0;

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [dismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de solicitud"
      className="fixed inset-0 z-40"
    >
      {/* scrim — neutral, ~40% (not accent) */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      {/* panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[390px] flex-col rounded-t-[20px] bg-surface shadow-xl outline-none"
      >
        {/* drag handle (decorative → neutral) */}
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        {/* scrollable content */}
        <div data-sheet-scroll className="flex-1 overflow-y-auto px-4 pb-4 pt-2">{children}</div>

        {/* sticky footer */}
        <div className="shrink-0 border-t border-neutral-100 bg-surface px-4 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}
