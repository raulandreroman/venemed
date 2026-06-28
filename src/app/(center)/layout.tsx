import type { ReactNode } from "react";

/**
 * Center back-office shell. Mobile-first 390px column on a light-gray page,
 * mirroring (public)/layout.tsx. This is the visual shell only — the DB-backed
 * authorization + status routing lives per-page via requireCenter()
 * (spec §9.1, Option B). Middleware already blocks anon access to gated routes.
 */
export default function CenterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-background">
      {children}
    </div>
  );
}
