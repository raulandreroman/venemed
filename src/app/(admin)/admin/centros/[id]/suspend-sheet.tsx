"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { suspendCenter } from "../../../actions/moderation";
import { REASON_MAX } from "../../../actions/types";
import { ReasonSheet } from "./reason-sheet";

/**
 * A5 · Suspend-reason sheet. Reuses the shared `ReasonSheet` chrome. Because
 * suspending takes a live, approved center offline, the required non-empty
 * reason IS the confirmation friction (no extra confirm layer). The reason is
 * stored on the center and shown to the responsable on their next login. On
 * success, navigate back to the queue with `?done=suspended` (fires the toast).
 * Follows review-actions.tsx: `router.push` ONLY — no `router.refresh()`.
 */
export function SuspendSheet({
  centerId,
  centerName,
  city,
  onClose,
}: {
  centerId: string;
  centerName: string;
  city: string;
  onClose: () => void;
}) {
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();

  const onSubmit = useCallback(async () => {
    const value = reason.trim();
    if (value.length === 0) return;
    setSubmitting(true);
    setError(null);
    const result = await suspendCenter(centerId, value);
    if (result.ok) {
      router.push("/admin?tab=pendientes&done=suspended");
      return;
    }
    setSubmitting(false);
    setError(result.error);
  }, [reason, centerId, router]);

  return (
    <ReasonSheet
      ariaLabel="Suspender centro"
      title="Suspender centro"
      subtitle={`${centerName} · ${city}`}
      error={error}
      submitLabel="Suspender"
      submittingLabel="Suspendiendo…"
      submitDisabled={trimmed.length === 0}
      submitting={submitting}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <p className="mt-3 text-sm leading-relaxed text-neutral-700">
        El centro saldrá de la lista pública de inmediato y el responsable verá
        el motivo la próxima vez que inicie sesión. Explica por qué lo suspendes.
      </p>

      <label
        htmlFor="suspend-reason"
        className="mt-5 block text-sm font-semibold text-neutral-900"
      >
        Motivo de la suspensión
      </label>
      <textarea
        id="suspend-reason"
        value={reason}
        maxLength={REASON_MAX}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        placeholder="Explica por qué se suspende el centro…"
        className="mt-2 w-full resize-none rounded-xl border border-neutral-300 bg-surface p-3 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <p className="mt-1 text-right text-xs text-neutral-400">
        {reason.length} / {REASON_MAX}
      </p>
    </ReasonSheet>
  );
}
