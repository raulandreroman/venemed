import { redirect } from "next/navigation";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { LoginForm } from "./login-form";

const ROUTE_BY_STATUS = {
  approved: "/centro",
  pending_review: "/centro/en-revision",
  rejected: "/centro/rechazado",
  suspended: "/centro/rechazado",
} as const;

/**
 * Login RSC wrapper. If already authed, redirect to the correct status
 * destination so the form is never shown to a logged-in user (belt-and-
 * suspenders with the middleware bounce). Otherwise render the client form.
 */
export default async function LoginPage() {
  const session = await getCurrentCenter();
  if (session.kind === "center") {
    redirect(ROUTE_BY_STATUS[session.center.status] ?? "/centro/en-revision");
  }
  if (session.kind === "no-membership") {
    redirect("/centro/registro");
  }
  return <LoginForm />;
}
