import type { RequestCardData } from "@/db/queries";
import { formatRequestedClock } from "@/lib/format";
import { Button } from "./button";
import { Card } from "./card";
import { ItemChip } from "./chip";
import { ShareCardButton } from "./share-card-button";
import { Tag, UrgencyTag } from "./tag";

const MAX_VISIBLE_ITEMS = 4;

/**
 * Donor list/landing card — needs only. An aviso de exceso (kind='surplus') is
 * never a card: it renders as a per-center <AvisoBanner> above the center's
 * cards (getActiveRequests filters to kind='need').
 */
export function RequestCard({ request }: { request: RequestCardData }) {
  const items = request.items;
  const visible = items.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = items.length - visible.length;

  const shareMessage = `Ayuda a ${request.centerName}${
    request.city ? ` (${request.city})` : ""
  } en VeneMed:`;

  return (
    <Card data-testid="request-card" data-center-name={request.centerName}>
      {/* header pills */}
      <div className="flex items-center justify-between gap-2">
        {request.city ? <Tag variant="neutral">{request.city}</Tag> : <span />}
        <UrgencyTag expiresAt={request.expiresAt} />
      </div>

      {/* center */}
      <h3 className="mt-3 text-lg font-bold leading-tight text-neutral-900">
        {request.centerName}
      </h3>
      {request.title && (
        <p className="mt-1 text-[15px] font-semibold text-neutral-900">
          {request.title}
        </p>
      )}
      {request.centerDescription && (
        <p className="mt-0.5 text-sm text-neutral-500">
          {request.centerDescription}
        </p>
      )}

      {/* items */}
      {visible.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {visible.map((item) => (
              <ItemChip key={item.id}>{item.name}</ItemChip>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
                +{overflow} más
              </span>
            )}
          </div>
        </div>
      )}

      {/* requested-at meta */}
      <p className="mt-3 text-xs text-neutral-500">
        {formatRequestedClock(request.publishedAt)}
      </p>

      {/* footer */}
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
        <ShareCardButton
          requestId={request.id}
          message={shareMessage}
          path={`/solicitudes/${request.id}`}
        />
        <Button
          variant="primary"
          size="sm"
          href={`/solicitudes/${request.id}`}
          className="flex-1"
        >
          Ver detalle
        </Button>
      </div>
    </Card>
  );
}
