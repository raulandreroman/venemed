"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

import { SuspendSheet } from "./suspend-sheet";

/**
 * Sticky action bar for an already-approved center. A single "Suspender" button
 * opens the A5 reason sheet; the required reason there is the confirmation
 * friction (no extra confirm). Mirrors the ReviewActions bar chrome.
 */
export function SuspendActions({
  centerId,
  centerName,
  city,
}: {
  centerId: string;
  centerName: string;
  city: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[390px] border-t border-neutral-100 bg-surface px-4 pb-5 pt-3">
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() => setSheetOpen(true)}
          className="border-[1.5px] border-error/40 bg-surface text-error hover:bg-error/5"
        >
          Suspender
        </Button>
      </div>

      {sheetOpen && (
        <SuspendSheet
          centerId={centerId}
          centerName={centerName}
          city={city}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
