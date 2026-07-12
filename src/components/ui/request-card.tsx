import type { ListaCardData } from "@/db/queries";
import { formatListaUpdated } from "@/lib/format";
import { Button } from "./button";
import { Card } from "./card";
import { ItemChip } from "./chip";
import { ShareCardButton } from "./share-card-button";
import { Tag } from "./tag";

const MAX_VISIBLE_ITEMS = 4;

/**
 * Donor list/landing card. The lista is the center's evergreen board — no
 * per-card title, no countdown (see lista-model-v2 §3d/§4).
 */
export function RequestCard({ request }: { request: ListaCardData }) {
  // Urgent items surface first; excess items are a separate summary pill
  // below, never counted toward the "+N más" overflow.
  const chips = [...request.urgentItems, ...request.needItems];
  const visible = chips.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = chips.length - visible.length;

  return (
    <Card
      data-testid="request-card"
      data-center-name={request.centerName}
      data-has-urgent={request.hasUrgent || undefined}
    >
      {/* header pills */}
      <div className="flex items-center justify-between gap-2">
        {request.city ? <Tag variant="neutral">{request.city}</Tag> : <span />}
        {request.hasUrgent && (
          <Tag variant="urgent" dot>
            Urgente
          </Tag>
        )}
      </div>

      {/* center */}
      <h3 className="mt-3 text-lg font-semibold leading-tight text-neutral-900">
        {request.centerName}
      </h3>
      {request.centerDescription && (
        <p className="mt-0.5 text-sm text-neutral-500">
          {request.centerDescription}
        </p>
      )}

      {/* items */}
      {chips.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {visible.map((item) => (
              <ItemChip
                key={item.id}
                tone={item.isUrgent ? "urgent" : "neutral"}
              >
                {item.name}
              </ItemChip>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
                +{overflow} más
              </span>
            )}
          </div>
        </div>
      )}

      {/* no aceptamos summary */}
      {request.excessItems.length > 0 && (
        <Tag
          variant="excess"
          className="mt-2 max-w-full whitespace-normal text-left"
        >
          No aceptamos: {request.excessItems.map((it) => it.name).join(", ")}
        </Tag>
      )}

      {/* freshness meta */}
      <p className="mt-3 text-xs text-neutral-500">
        {formatListaUpdated(request.updatedAt)}
      </p>

      {/* footer */}
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
        <ShareCardButton
          requestId={request.id}
          path={`/listas/${request.id}`}
        />
        <Button
          variant="primary"
          size="sm"
          href={`/listas/${request.id}`}
          className="flex-1"
        >
          Ver más
        </Button>
      </div>
    </Card>
  );
}
