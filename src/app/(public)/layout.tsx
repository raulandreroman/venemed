import type { ReactNode } from "react";

/**
 * Donor (logged-out) shell. Mobile-first: content centered in a 390px
 * max-width column on a light-gray page. Spanish surface.
 */
export default function PublicLayout({
  children,
  modal,
}: {
  children: ReactNode;
  /** Parallel slot for the intercepted detail bottom sheet. */
  modal: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-background">
      {children}
      {modal}
    </div>
  );
}
