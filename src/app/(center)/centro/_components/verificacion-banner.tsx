/**
 * Persistent notice for a `pending_review` center. Moderation no longer blocks
 * publishing (see `lib/auth/lista-access.ts`), so the dashboard has to carry
 * the state the old `/centro/en-revision` dead-end used to: verification is
 * running, a moderator will reach out, and meanwhile the lista is public but
 * carries a "Sin verificar" label and ranks below the vetted centers.
 */
export function VerificacionBanner() {
  return (
    <div className="rounded-2xl border border-warning/20 bg-warning-tint p-4">
      <div className="flex items-center gap-2">
        <span className="text-warning">
          <ShieldClockIcon />
        </span>
        <h2 className="text-base font-bold text-neutral-900">
          Verificación en proceso
        </h2>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-700">
        Un moderador de VeneMed revisará tu centro y te contactará por correo.
        Mientras tanto ya puedes publicar y compartir tu lista: aparece marcada
        como <span className="font-semibold">sin verificar</span> y debajo de
        los centros ya verificados.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-neutral-600">
        Nunca te pedimos dinero ni claves.
      </p>
    </div>
  );
}

function ShieldClockIcon() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}
