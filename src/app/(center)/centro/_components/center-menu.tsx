"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { signOut } from "../../actions/auth";

/**
 * Overflow (kebab) menu for the dashboard header (Figma 66:2365 / 66:2278).
 * Client island — owns open/close, click-outside, and Esc. State only ever
 * mutates from event handlers (never synchronously inside an effect body) to
 * stay clear of the react-hooks/set-state-in-effect eslint error.
 *
 * Rows:
 *  - "Ver centro médico" → /centro/perfil (the center profile, slice 4)
 *  - "Cerrar sesión" → posts the existing signOut server action
 */
export function CenterMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Más opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <DotsVertical />
      </button>

      {open && (
        <>
          {/* dimmed scrim */}
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-neutral-900/40"
          />
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-xl border border-neutral-100 bg-surface shadow-lg"
          >
            <Link
              role="menuitem"
              href="/centro/perfil"
              onClick={close}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-100"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-on">
                {initials}
              </span>
              <span className="flex-1 text-[15px] font-medium text-neutral-900">
                Ver centro médico
              </span>
              <ChevronRight className="text-neutral-300" />
            </Link>

            <div className="h-px bg-neutral-100" />

            <form action={signOut} role="menuitem">
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error-tint text-error">
                  <LogoutArrow />
                </span>
                <span className="flex-1 text-[15px] font-medium text-error">
                  Cerrar sesión
                </span>
                <ChevronRight className="text-neutral-300" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function DotsVertical() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function ChevronRight({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function LogoutArrow() {
  return (
    <svg
      width="16"
      height="16"
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
