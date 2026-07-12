import Link from "next/link";

import type { CenterListaCardData } from "@/db/queries";
import { Card, ItemChip } from "@/components/ui";
import { ShareCardButton } from "@/components/ui/share-card-button";
import { formatRequestedClock } from "@/lib/format";

import { ReactivateButton } from "./reactivate-button";

// Figma 32:4898 shows 3 chips then "+N más" (donor card uses 4).
const MAX_VISIBLE_ITEMS = 3;

/**
 * The center's own lista, as shown in "Tus solicitudes". Distinct from the
 * donor RequestCard: meta is "#{id}", and the footer share targets the PUBLIC
 * donor link the center sends to donors.
 */
export function CenterRequestCard({
  request,
}: {
  request: CenterListaCardData;
}) {
  const items = request.items;
  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = items.length - visible.length;
  // Human-friendly global display id (lista.short_id, added in migration 0004).
  const shortId = request.shortId;

  const isTerminal = request.status === "closed";

  return (
    <Card data-testid="center-request-card" className="p-[18px]">
      {/* body → center detail (the share button below stays a public link) */}
      <Link
        href={`/centro/lista/${request.id}`}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {/* title */}
        <h3 className="text-lg font-bold leading-tight text-neutral-900">
          Lista
        </h3>

        {/* meta: #id */}
        <p className="mt-0.5 text-sm text-neutral-500">#{shortId}</p>

        {/* item chips */}
        {visible.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visible.map((item) => (
              <ItemChip key={item.id}>{item.name}</ItemChip>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
                +{overflow} más
              </span>
            )}
          </div>
        )}

        {/* requested-at */}
        <p className="mt-3 text-xs text-neutral-500">
          {formatRequestedClock(request.publishedAt)}
        </p>
      </Link>

      {/* footer: inactive → Reactivar; active → share (public link) */}
      <div className="mt-3 border-t border-neutral-100 pt-3">
        {isTerminal ? (
          <ReactivateButton requestId={request.id} />
        ) : (
          <div className="flex items-center gap-2">
            <ShareCardButton
              requestId={request.id}
              path={`/listas/${request.id}`}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
