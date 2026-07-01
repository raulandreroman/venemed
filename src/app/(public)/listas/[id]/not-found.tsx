import { AppBar, Button } from "@/components/ui";

export default function RequestNotFound() {
  return (
    <>
      <AppBar title="Detalle de la lista" />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-neutral-900">
          Esta lista ya no está disponible
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Puede que se haya cerrado o que el enlace sea incorrecto.
        </p>
        <Button variant="primary" href="/listas" className="mt-6">
          Ver listas activas
        </Button>
      </main>
    </>
  );
}
