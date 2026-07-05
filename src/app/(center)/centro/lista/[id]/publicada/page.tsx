import { getCenterListaById } from "@/db/queries";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublishedShare } from "../../_components/published-share";

export default async function PublicadaPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return notFound();

  const center = session.user.center;
  if (!center) return notFound();

  const request = await getCenterListaById(center.centerId, params.id);
  if (!request) return notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Close-to-dashboard header */}
      <Link
        href="/centro/lista"
        className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        ← Volver al dashboard
      </Link>

      {/* Success heading */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-green-600">¡Lista publicada!</h1>
        <p className="mt-2 text-gray-600">
          Ya es visible para los voluntarios. Puedes compartir el enlace para que
          donen los insumos.
        </p>
      </div>

      {/* Share section */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Compartir</h2>
        <PublishedShare listaId={request.id} />
      </div>

      {/* Sticky footer CTAs */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="mx-auto flex max-w-2xl gap-4">
          <Link
            href={`/lista/${request.id}`}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-center text-white hover:bg-green-700"
          >
            Ver en la lista
          </Link>
          <Link
            href="/centro/lista"
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-center text-gray-700 hover:bg-gray-50"
          >
            Ir al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
