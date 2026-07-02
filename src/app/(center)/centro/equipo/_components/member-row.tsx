"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog, RoleTag } from "@/components/ui";
import { formatShortDate } from "@/lib/format";
import { removeMember } from "@/app/(center)/actions/equipo";

/** The update actions can redirect — the thrown NEXT_REDIRECT must be
 * re-thrown so Next navigates (matches profile-sections.tsx's pattern). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export type MemberRowData = {
  userId: string;
  name: string | null;
  role: "center_admin" | "center_member";
  createdAt: Date;
  isSelf: boolean;
};

/** One row of the "Miembros" list (Figma MemberRow 209:4564). */
export function MemberRow({ member }: { member: MemberRowData }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = member.name?.trim() || "Sin nombre";

  const onConfirmRemove = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await removeMember(member.userId);
      setPending(false);
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setPending(false);
      setError("No pudimos quitar a esta persona. Inténtalo de nuevo.");
    }
  }, [member.userId, router]);

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          member.role === "center_admin"
            ? "bg-accent text-accent-on"
            : "bg-neutral-100 text-neutral-700"
        }`}
      >
        {initialsFrom(displayName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-neutral-900">
            {displayName}
          </span>
          <RoleTag role={member.role} />
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          Desde {formatShortDate(member.createdAt)} ·{" "}
          {member.isSelf ? "te registraste" : "agregada por el responsable"}
        </p>
      </div>

      {member.isSelf ? (
        <span className="shrink-0 text-sm text-neutral-400">Tú</span>
      ) : (
        <button
          type="button"
          aria-label={`Quitar a ${displayName}`}
          onClick={() => setConfirmOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <CloseIcon />
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`¿Quitar a ${displayName}?`}
        body="Perderá acceso al panel. Las solicitudes que ya creó seguirán visibles y atribuidas a su nombre."
        confirmLabel="Quitar"
        confirmVariant="danger"
        pending={pending}
        error={error}
        onConfirm={() => void onConfirmRemove()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return letters.toUpperCase() || "?";
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
