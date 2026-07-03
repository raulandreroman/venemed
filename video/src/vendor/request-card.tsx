/**
 * Vendored from src/components/ui/request-card.tsx — the ACTUAL donor list
 * card. Changes vs. the app, kept minimal:
 *  - Data comes in as a plain demo type (no @/db/queries).
 *  - formatListaUpdated is precomputed (Remotion renders must be deterministic,
 *    no wall-clock reads).
 *  - ShareCardButton → its exact visual (ghost Button + ShareArrow); the click
 *    handler is meaningless in a video.
 * Markup and class strings are otherwise verbatim.
 */
import { Button, Card, ItemChip, ShareArrow, Tag } from "./ui";

const MAX_VISIBLE_ITEMS = 4;

export type DemoItem = { id: string; name: string; isUrgent: boolean };

export type DemoLista = {
  centerName: string;
  centerDescription: string | null;
  city: string | null;
  hasUrgent: boolean;
  urgentItems: DemoItem[];
  needItems: DemoItem[];
  excessItems: { name: string }[];
  updatedLabel: string; // precomputed formatListaUpdated output
};

export function RequestCard({ request }: { request: DemoLista }) {
  const chips = [...request.urgentItems, ...request.needItems];
  const visible = chips.slice(0, MAX_VISIBLE_ITEMS);
  const overflow = chips.length - visible.length;

  return (
    <Card>
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
      <p className="mt-3 text-xs text-neutral-500">{request.updatedLabel}</p>

      {/* footer */}
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3">
        <Button variant="ghost" size="sm" className="flex-1">
          <ShareArrow />
          Compartir
        </Button>
        <Button variant="primary" size="sm" className="flex-1">
          Ver más
        </Button>
      </div>
    </Card>
  );
}
