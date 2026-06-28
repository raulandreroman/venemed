import { AppBar, Button, Card } from "@/components/ui";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { SignOutButton } from "../../_components/sign-out-button";

/**
 * PLACEHOLDER for the "no membership" destination — also the public landing the
 * login screen's "Registra tu centro" link points to. The real registration
 * flow (R0 → datos → verificar → en revisión) ships in a later phase. Public:
 * reachable without a session (see PUBLIC_CENTER_PATHS in middleware).
 */
export default async function RegistroPage() {
  const session = await getCurrentCenter();
  const isAuthed = session.kind !== "anon";

  return (
    <>
      <AppBar title="Registrar centro" backHref="/centro/login" />
      <main className="flex flex-1 flex-col justify-center p-4">
        <Card className="text-center">
          <h1 className="text-2xl font-bold text-neutral-900">Regístrate</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            El registro de centros estará disponible pronto. Si tu centro ya
            está registrado, inicia sesión con el teléfono del responsable.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button href="/centro/login" fullWidth>
              Iniciar sesión
            </Button>
            {isAuthed && <SignOutButton variant="ghost" />}
          </div>
        </Card>
      </main>
    </>
  );
}
