"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { RoleTag } from "@/components/ui";
import { formatTimeLeft } from "@/lib/format";
import { revokeInvitation } from "@/app/(center)/actions/equipo";

function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export type PendingInvitationRowData = {
  id: string;
  label: string | null;
  expiresAt: Date;
};

/**
 * A still-open invite link (Figma pending row, adapted for the email+link
 * flow). Only the token HASH is stored, so the raw link cannot be
 * reproduced after creation — there is deliberately no "Copiar"/"Reenviar"
 * here. Revoking + creating a fresh invite is the supported "resend".
 */
export function PendingInvitationRow({
  invite,
}: {
  invite: PendingInvitationRowData;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onRevoke = useCallback(async () => {
    setPending(true);
    try {
      await revokeInvitation(invite.id);
      router.refresh();
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setPending(false);
    }
  }, [invite.id, router]);

  return (
    <div className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-bold text-neutral-500">
        <LinkIcon />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-neutral-900">
            {invite.label?.trim() || "Sin nombre"}
          </span>
          <RoleTag role="pending" />
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {formatTimeLeft(invite.expiresAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => void onRevoke()}
        disabled={pending}
        className="shrink-0 text-sm font-semibold text-error disabled:opacity-50"
      >
        {pending ? "Revocando…" : "Revocar"}
      </button>
    </div>
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
      <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.5-1.5" />
    </svg>
  );
}
