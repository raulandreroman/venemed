import * as Sentry from "@sentry/nextjs";

// Next.js loads the runtime-appropriate Sentry config once, at startup.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures errors thrown in nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
