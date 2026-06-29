import Link from "next/link";

import type { CenterRequestCardData } from "@/db/queries";
import { Card, ItemChip, Tag, UrgencyTag } from "@/components/ui";
import { ShareCardButton } from "@/components/ui/share-card-button";
import {
  categoryLabel,
  closedReasonLabel,
  formatRequestedClock,
} from "@/lib/format";

// Figma 32:4898 shows 3 chips then "+N más" (donor card uses 4).
const MAX_VISIBLE_ITEMS = 3;

/**
 * The center's own request, as shown in "Tus solicitudes". Distinct from the
 * donor RequestCard: leads with request.title, meta is "{área} · #{id}", and
 * the footer share targets the PUBLIC donor link the center sends to donors.
 */
export function CenterRequestCard({
  request,
}: {
  request: CenterRequestCardData;
}) {
  const items = request.items;
  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = items.length - visible.length;
  const area = request.categories?.[0]
    ? categoryLabel(request.categories[0])
    : null;
  // Human-friendly global display id (request.short_id, added in migration 0004).
  const shortId = request.shortId;

  const isTerminal = request.status === "closed" || request.status === "expired";
  const shareMessage = request.title
    ? `Ayuda al centro con: ${request.title}`
    : "Ayuda al centro en VeneMed:";

  return (
    <Card data-testid="center-request-card" className={isTerminal ? "opacity-70" : ""}>
      {/* body → center detail (the share button below stays a public link) */}
      <Link
        href={`/centro/solicitudes/${request.id}`}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {/* title */}
        <h3 className="text-lg font-bold leading-tight text-neutral-900">
          {request.title ?? "Solicitud"}
        </h3>

        {/* meta: {área} · #id */}
        <p className="mt-0.5 text-sm text-neutral-500">
          {area ? `${area} · ` : ""}#{shortId}
        </p>

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

        {/* requested-at + window */}
        <p className="mt-3 text-xs text-neutral-500">
          {formatRequestedClock(request.publishedAt)} · Ventana de{" "}
          {request.windowHours} h
        </p>
      </Link>

      {/* footer: share (public link) + countdown/status */}
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
        <ShareCardButton
          requestId={request.id}
          message={shareMessage}
          path={`/solicitudes/${request.id}`}
        />
        <span className="ml-auto">
          {isTerminal ? (
            <Tag variant={request.status === "expired" ? "expired" : "fulfilled"}>
              {closedReasonLabel(request.closedReason)}
            </Tag>
          ) : (
            <UrgencyTag expiresAt={request.expiresAt} />
          )}
        </span>
      </div>
    </Card>
  );
}
