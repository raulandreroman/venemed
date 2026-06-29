import { Button } from "@/components/ui";
import { signOut } from "../actions/auth";

/**
 * Sign-out control. Posts to the signOut server action (clears the session
 * cookie + redirects to /centro/login). Server-renderable — no client hooks.
 */
export function SignOutButton({
  label = "Cerrar sesión",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <form action={signOut} className="w-full">
      <Button type="submit" variant={variant} fullWidth>
        {label}
      </Button>
    </form>
  );
}
