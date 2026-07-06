"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { createInvitation } from "@/app/(center)/actions/equipo";
import { validateInviteLabel } from "@/lib/team/validation";

function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

type SheetState = "form" | "link";

/**
 * "+ Invitar a alguien" entry point + its two-step bottom sheet: the invite
 * form (Figma 253:4436) and the "Enlace creado" success state (Figma
 * 253:4457). Bottom-sheet chrome mirrors reception-toggle.tsx (scrim +
 * bottom-0 panel, Escape + scroll-lock in an effect that never sets state
 * synchronously — gotcha #3).
 */
export function InviteMemberButton({
  centerName,
  atCap,
}: {
  centerName: string;
  atCap: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SheetState>("form");
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (pending) return;
    setOpen(false);
    setState("form");
    setLabel("");
    setLabelError(undefined);
    setError(null);
    setUrl("");
    setCopyFeedback(null);
    // Keep the team list fresh so a just-created pending invitation shows up.
    // This ran on the removed "Listo" button; now every dismiss refreshes.
    router.refresh();
  }, [pending, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const onCreate = useCallback(async () => {
    const parsed = validateInviteLabel(label);
    if (!parsed.ok) {
      setLabelError(parsed.error);
      return;
    }
    setLabelError(undefined);
    setError(null);
    setPending(true);
    try {
      const { url: created } = await createInvitation(parsed.value ?? undefined);
      setUrl(created);
      setState("link");
      setPending(false);
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setPending(false);
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos crear el enlace. Inténtalo de nuevo.",
      );
    }
  }, [label]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Enlace copiado.");
    } catch {
      setCopyFeedback(null);
    }
  }, [url]);

  const onShare = useCallback(async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: "Invitación a VeneMed" });
        return;
      } catch {
        // user cancelled or share unsupported in this context — fall through
      }
    }
    await onCopy();
  }, [url, onCopy]);

  return (
    <>
      <Button
        type="button"
        fullWidth
        disabled={atCap}
        onClick={() => setOpen(true)}
      >
        + Invitar a alguien
      </Button>
      {atCap && (
        <p className="mt-2 text-center text-xs text-neutral-400">
          Alcanzaste el máximo de 5 miembros.
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={state === "form" ? "Invitar a alguien" : "Enlace de invitación listo"}
          className="fixed inset-0 z-50"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[85dvh] w-full max-w-[390px] flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-surface px-5 pb-6 pt-2 outline-none"
          >
            <div className="flex justify-center pb-1">
              <span className="h-1 w-9 rounded-full bg-neutral-300" />
            </div>

            {state === "form" ? (
              <>
                <h2 className="text-lg font-bold text-neutral-900">
                  Invitar a alguien
                </h2>
                <p className="text-sm text-neutral-500">
                  Comparte un enlace de un solo uso. Quien lo abra confirma su
                  correo y se une al equipo de {centerName}.
                </p>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-neutral-500">
                    Nombre (opcional)
                  </span>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Cómo lo conocen en el centro"
                    className={`h-11 w-full rounded-xl border bg-surface px-3 text-[15px] text-neutral-900 outline-none focus:ring-2 focus:ring-accent/30 ${
                      labelError
                        ? "border-error"
                        : "border-neutral-300 focus:border-accent"
                    }`}
                  />
                  {labelError && (
                    <span className="text-xs text-error">{labelError}</span>
                  )}
                </label>

                <div className="rounded-xl bg-accent-subtle p-3.5 text-accent">
                  <p className="text-sm font-semibold">
                    Se agregará como Operador
                  </p>
                  <p className="mt-0.5 text-sm">
                    Podrá editar la lista del centro y agregar insumos, pero no
                    invitar a otros miembros.
                  </p>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-error">
                    {error}
                  </p>
                )}

                <Button
                  type="button"
                  fullWidth
                  disabled={pending}
                  onClick={() => void onCreate()}
                >
                  {pending ? "Creando…" : "Crear enlace de invitación"}
                </Button>
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="text-sm font-semibold text-neutral-500 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-neutral-900">
                  Enlace de invitación listo
                </h2>
                <p className="text-sm text-neutral-500">
                  Compártelo con la persona que quieres invitar. Funciona una
                  sola vez y vence en 24 h.
                </p>

                <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5">
                  <span
                    data-testid="invite-url"
                    className="min-w-0 flex-1 truncate text-sm text-neutral-700"
                  >
                    {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onCopy()}
                    className="shrink-0 text-sm font-semibold text-accent"
                  >
                    Copiar
                  </button>
                </div>
                {copyFeedback && (
                  <p className="text-xs text-neutral-500">{copyFeedback}</p>
                )}

                <Button type="button" fullWidth onClick={() => void onShare()}>
                  Compartir enlace
                </Button>

                <p className="text-center text-xs text-neutral-400">
                  Enlace de un solo uso · vence en 24 h
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
