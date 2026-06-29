import { redirect } from "next/navigation";
import { AppBar, Card } from "@/components/ui";
import { requireCenter } from "@/lib/auth/require-center";
import { SignOutButton } from "../_components/sign-out-button";

/**
 * PLACEHOLDER dashboard (approved centers). Proves the guard + identity work:
 * the center name is read via Drizzle filtered by center_id (getCurrentCenter),
 * and sign-out works. The real back office ships in a later phase.
 */
export default async function CenterDashboardPage() {
  const center = await requireCenter();
  if (center.status === "pending_review") redirect("/centro/en-revision");
  if (center.status === "rejected" || center.status === "suspended") {
    redirect("/centro/rechazado");
  }
  // status === "approved" → render dashboard

  return (
    <>
      <AppBar title="Panel del centro" backHref={null} align="start" />
      <main className="flex flex-1 flex-col gap-4 p-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Centro
          </p>
          <p className="mt-1 text-xl font-bold text-neutral-900">
            {center.centerName}
          </p>
          <p className="mt-3 text-sm text-neutral-500">
            Back office (próximamente). Aquí podrás publicar y gestionar tus
            alertas de necesidades.
          </p>
        </Card>

        <div className="mt-auto pt-4">
          <SignOutButton variant="secondary" />
        </div>
      </main>
    </>
  );
}
