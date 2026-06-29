"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const MESSAGES: Record<string, string> = {
  approved: "Centro aprobado",
  rejected: "Centro rechazado",
  suspended: "Centro suspendido",
};

/**
 * D3 post-decision toast (Figma `53:1340`). Reads `?done=approved|rejected`
 * (set when navigating back from A3) and shows a transient success toast, then
 * strips the param so a refresh doesn't re-fire it.
 *
 * The message is captured ONCE via a useState initializer (not in an effect),
 * so cleaning the URL doesn't drop it — and `setVisible` is only ever called
 * inside a timeout callback, never synchronously in the effect body (avoids the
 * `react-hooks/set-state-in-effect` hard lint error).
 */
export function AdminToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [message] = useState<string | null>(() => {
    const done = params.get("done");
    return done && done in MESSAGES ? MESSAGES[done] : null;
  });
  const [visible, setVisible] = useState<boolean>(() => message !== null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setVisible(false), 2800);
    if (params.has("done")) {
      const next = new URLSearchParams(params.toString());
      next.delete("done");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    return () => clearTimeout(t);
  }, [message, params, router, pathname]);

  if (!visible || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 mx-auto flex w-full max-w-[390px] justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-surface shadow-lg">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-surface">
          <CheckIcon />
        </span>
        {message}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
