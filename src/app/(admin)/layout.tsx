import type { ReactNode } from "react";

/**
 * Admin moderation shell. Mobile-first 390px column (the delivered Figma
 * A1/A2/A3/A4 frames are all 390-wide), mirroring (center)/layout.tsx. This is
 * the visual shell ONLY — the DB-backed authorization lives per gated page via
 * requireAdmin() (the layout also wraps the public /admin/login, which must NOT
 * call requireAdmin()). Middleware blocks anon access to the gated routes.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-background">
      {children}
    </div>
  );
}
