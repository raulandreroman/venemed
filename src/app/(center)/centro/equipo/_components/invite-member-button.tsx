import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/react";

export function InviteMemberButton() {
  const [state, setState] = useState<
    "idle" | "loading" | "link" | "copied"
  >("idle");
  const [url, setUrl] = useState<string | null>(null);

  const createInviteLink = trpc.invite.create.useMutation({
    onSuccess: (data) => {
      setUrl(data.url);
      setState("link");
    },
    onError: (error) => {
      toast.error(error.message);
      setState("idle");
    },
  });

  const handleGenerateLink = useCallback(() => {
    setState("loading");
    createInviteLink.mutate();
  }, [createInviteLink]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      toast.success("Enlace copiado");
    } catch {
      toast.error("Error al copiar");
    }
  }, [url]);

  const handleClose = useCallback(() => {
    setState("idle");
    setUrl(null);
  }, []);

  return (
    <div className="space-y-4">
      {state === "idle" && (
        <Button type="button" onClick={handleGenerateLink}>
          Compartir enlace
        </Button>
      )}
      {state === "loading" && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Generando enlace...</span>
        </div>
      )}
      {state === "link" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-neutral-700">
            Enlace creado
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5">
            <span
              data-testid="invite-url"
              className="min-w-0 flex-1 truncate text-sm text-neutral-700"
            >
              {url}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 text-sm font-semibold text-accent"
            >
              Copiar
            </button>
          </div>
          <Button type="button" onClick={handleClose}>
            Compartir enlace
          </Button>
        </div>
      )}
      {state === "copied" && (
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-sm text-green-700">Enlace copiado</span>
        </div>
      )}
    </div>
  );
}
