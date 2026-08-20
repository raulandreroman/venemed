import { redirect } from "next/navigation";
import { getCurrentCenter } from "@/lib/auth/current-center";
// Shared with resolveLoginDestination — a local copy silently drifted from it
// when pending_review stopped routing to /centro/en-revision.
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { LoginForm } from "./login-form";

/**
 * Login RSC wrapper. If already authed, redirect to the correct status
 * destination so the form is never shown to a logged-in user (belt-and-
 * suspenders with the middleware bounce). Otherwise render the client form.
 */
export default async function LoginPage() {
  const session = await getCurrentCenter();
  if (session.kind === "center") {
    redirect(ROUTE_BY_STATUS[session.center.status] ?? "/centro");
  }
  if (session.kind === "no-membership") {
    redirect("/centro/registro");
  }
  return <LoginForm />;
}
