import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar, Button, ItemChip } from "@/components/ui";
import {
  getActiveSupplies,
  getCenterActiveSurplus,
  type CenterActiveSurplus,
} from "@/db/queries";
import { requireCenter } from "@/lib/auth/require-center";
import { formatTimeLeft } from "@/lib/format";
import { SIN_LIMITE, type WindowChoice } from "@/lib/aviso/validation";

import { AvisoForm } from "./_components/aviso-form";
import { RemoveAvisoButton } from "./_components/remove-aviso-button";
import type { SelectedItem } from "../solicitudes/nueva/_components/create-request-form";

/**
 * Aviso de exceso flow (Figma 80:2048 form / 80:2590 review). Server wrapper:
 * same approved-only gate as the dashboard. When the center already has an
 * active aviso it renders the REVIEW screen (80:2590) first ("Continuar sin
 * cambios" / "Editar aviso"); `?editar=1` (the review's Editar) or no active
 * aviso renders the FORM. The form is pre-filled in edit mode.
 */
export default async function AvisoPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>;
}) {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }

  const { editar } = await searchParams;
  const [supplies, active] = await Promise.all([
    getActiveSupplies(),
    getCenterActiveSurplus(center.centerId),
  ]);

  // Active aviso + not explicitly editing → the review screen.
  if (active && editar !== "1") {
    return <AvisoReview active={active} />;
  }

  const editing = active != null;
  return (
    <>
      <AppBar
        title={editing ? "Editar aviso de exceso" : "Aviso de exceso"}
        backHref="/centro"
        align="start"
      />
      <AvisoForm
        supplies={supplies}
        avisoId={active?.id}
        initialItems={active ? toSelectedItems(active.items) : []}
        initialReason={active?.reason ?? ""}
        initialWindowChoice={
          active ? toWindowChoice(active.windowHours) : 24
        }
      />
    </>
  );
}

function toSelectedItems(
  items: CenterActiveSurplus["items"],
): SelectedItem[] {
  return items.map((it) => ({
    key: it.supplyId ?? `custom:${it.name.toLowerCase()}`,
    supplyId: it.supplyId ?? undefined,
    name: it.name,
  }));
}

function toWindowChoice(windowHours: number | null): WindowChoice {
  if (windowHours === null) return SIN_LIMITE;
  if (windowHours === 12 || windowHours === 24 || windowHours === 48)
    return windowHours;
  return 24; // defensive fallback
}

/** Review screen (Figma 80:2590) — shown when an aviso is already active. */
function AvisoReview({ active }: { active: CenterActiveSurplus }) {
  const timeLabel = active.expiresAt
    ? formatTimeLeft(active.expiresAt).toLowerCase()
    : "sin fecha de cierre";

  return (
    <>
      <AppBar title="Aviso de exceso" backHref="/centro" align="start" />

      <main className="flex flex-1 flex-col gap-5 px-4 pb-28 pt-4">
        <div className="rounded-2xl bg-warning-tint p-4 text-warning">
          <p className="text-sm font-semibold">Aviso activo · {timeLabel}</p>
        </div>

        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Por favor no traigan:
          </h2>
          {active.items.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {active.items.map((it) => (
                <ItemChip key={it.id}>{it.name}</ItemChip>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Sin insumos.</p>
          )}
        </section>

        {active.reason && (
          <section>
            <h2 className="text-lg font-bold text-neutral-900">Razón</h2>
            <p className="mt-2 text-[15px] text-neutral-900">{active.reason}</p>
          </section>
        )}
      </main>

      {/* sticky footer: continuar / editar / quitar */}
      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-100 bg-background px-4 py-3">
        <Button href="/centro" fullWidth>
          Continuar sin cambios
        </Button>
        <Link
          href="/centro/aviso?editar=1"
          className="flex h-12 items-center justify-center rounded-xl border border-neutral-300 text-[15px] font-semibold text-accent"
        >
          Editar aviso
        </Link>
        <RemoveAvisoButton avisoId={active.id} />
      </footer>
    </>
  );
}
