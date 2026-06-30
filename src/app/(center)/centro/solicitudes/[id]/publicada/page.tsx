import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui";
import { getCenterRequestById } from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { formatDeliveryCutoff } from "@/lib/format";

import { CenterRequestCard } from "../../../_components/center-request-card";
import { PublishedShare } from "./_components/published-share";

/**
 * Solicitud publicada (Figma 32:5064). Dedicated full-page confirm that
 * publishRequest redirects to (so it reads the real short_id + window for the
 * preview card and the auto-close banner). Reads the request scoped to the
 * logged-in center; a foreign / missing id is notFound().
 */
export default async function PublicadaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const request = await getCenterRequestById(center.centerId, id);
  if (!request) notFound();

  const shareMessage = request.title
    ? `Ayuda al centro con: ${request.title}`
    : "Ayuda al centro en VeneMed:";

  return (
    <>
      {/* top-right close → dashboard */}
      <header className="flex h-14 items-center justify-end px-4">
        <Link
          href="/centro"
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
        >
          <CloseIcon />
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 pb-28 pt-2">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-success-tint text-success">
            <CheckIcon />
          </span>
          <h1 className="text-2xl font-bold text-neutral-900">
            ¡Solicitud publicada!
          </h1>
          <p className="max-w-[320px] text-sm text-neutral-500">
            Ya es visible para los donantes. Compártela para que la ayuda llegue
            más rápido.
          </p>
        </div>

        {/* preview card (reuses the dashboard card) */}
        <CenterRequestCard request={request} />

        {/* share */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-neutral-900">
            Compartir solicitud
          </h2>
          <PublishedShare
            requestId={request.id}
            message={shareMessage}
            path={`/solicitudes/${request.id}`}
          />
        </section>

        {/* auto-close banner */}
        <div className="flex items-start gap-2.5 rounded-xl bg-warning-tint p-3.5 text-warning">
          <span className="mt-0.5 shrink-0">
            <ClockIcon />
          </span>
          <p className="text-sm">
            Se cerrará automáticamente{" "}
            {formatDeliveryCutoff(request.expiresAt).toLowerCase()} (en{" "}
            {request.windowHours} h).
          </p>
        </div>

        {/* post-publish prompt → aviso de exceso (decision §6.2) */}
        <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              ¿Hay algo que ya no necesitas?
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Publica un aviso de exceso para que los donantes no envíen lo que
              ya tienes de sobra.
            </p>
          </div>
          <Button href="/centro/aviso" fullWidth>
            Crear aviso de exceso
          </Button>
          <Button href="/centro" variant="outline" fullWidth>
            Continuar sin aviso de exceso
          </Button>
        </section>
      </main>

      {/* sticky footer: ver en la lista + ir al panel */}
      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-100 bg-background px-4 py-3">
        <Button href={`/solicitudes/${request.id}`} fullWidth>
          Ver en la lista
        </Button>
        <Button href="/centro" variant="outline" fullWidth>
          Ir al panel
        </Button>
      </footer>
    </>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
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

function CheckIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
