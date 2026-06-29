"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";

import { approveCenter } from "../../../actions/moderation";
import { RejectSheet } from "./reject-sheet";

/**
 * A3 sticky action bar (Figma `53:1176`). Approve calls the server action and,
 * on success, navigates back to the queue with `?done=approved` (which fires the
 * D3 toast and shows the revalidated list). Reject opens the A4 sheet.
 */
export function ReviewActions({
  centerId,
  centerName,
  city,
}: {
  centerId: string;
  centerName: string;
  city: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onApprove() {
    setApproving(true);
    setError(null);
    const result = await approveCenter(centerId);
    if (result.ok) {
      router.push("/admin?tab=pendientes&done=approved");
      return;
    }
    setApproving(false);
    setError(result.error);
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[390px] border-t border-neutral-100 bg-surface px-4 pb-5 pt-3">
        {error && (
          <p role="alert" className="mb-2 text-center text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={approving}
            onClick={() => setSheetOpen(true)}
            className="border-[1.5px] border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-50"
          >
            Rechazar
          </Button>
          <Button
            type="button"
            fullWidth
            disabled={approving}
            onClick={onApprove}
          >
            {approving ? "Aprobando…" : "Aprobar"}
          </Button>
        </div>
      </div>

      {sheetOpen && (
        <RejectSheet
          centerId={centerId}
          centerName={centerName}
          city={city}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
