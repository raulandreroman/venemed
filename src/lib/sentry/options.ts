import type { ErrorEvent, BrowserOptions } from "@sentry/nextjs";

// Public DSN (safe in the client bundle). When unset — local dev + CI — Sentry
// is disabled and nothing is sent, mirroring the captcha's env-gating.
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
export const SENTRY_ENABLED = Boolean(SENTRY_DSN);

// Venezuelan phone shapes (E.164 +58…, or a national 0?4XXXXXXXXX). We scrub
// these from any free-text that reaches Sentry as a defense-in-depth against a
// phone number leaking into an error message or breadcrumb.
const PHONE_RE = /(\+?58\s?\d{9,10}|\b0?4\d{2}\s?\d{7}\b)/g;
// Email addresses — now the login identity, so the highest-value PII to keep out
// of error payloads (e.g. a DB error echoing an app_user upsert's params).
const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;

function redact(text: string): string {
  return text
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PHONE_RE, "[redacted-phone]");
}

/**
 * beforeSend hook — strips identifying data from every event before it leaves
 * the app. Given the threat model (state persecution), we do NOT want Sentry to
 * become a store of user IPs, phone numbers, or request bodies:
 *  - drop `user` entirely (removes IP even if something set it)
 *  - drop request headers, cookies, and bodies
 *  - redact phone-shaped strings from message / exception / breadcrumbs
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;

  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    if (event.request.url) event.request.url = redact(event.request.url);
  }

  if (event.message) event.message = redact(event.message);

  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redact(value.value);
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = redact(crumb.message);
    // Breadcrumb `data` can carry request/fetch payloads — drop it wholesale.
    delete crumb.data;
  }

  return event;
}

/**
 * Shared init options for every runtime (client / server / edge). Errors only —
 * performance tracing is off (`tracesSampleRate: 0`) so we never capture request
 * transactions carrying headers/IPs, and Session Replay is intentionally absent
 * (it would record the OTP screen). PII attachment is off.
 */
export const baseSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  // Keep noise low; only report in real deployments.
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: scrubEvent,
} satisfies BrowserOptions;
