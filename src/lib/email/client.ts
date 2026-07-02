import "server-only";

import { Resend } from "resend";

/**
 * App-level transactional email (Resend HTTP API). Distinct from auth OTP,
 * which Supabase Auth sends over SMTP entirely outside the app.
 *
 * Lazy singleton: `getResend()` returns null when RESEND_API_KEY is unset
 * (local dev + CI), so callers can cleanly SKIP the send instead of crashing.
 * Set the key only in Vercel prod/preview.
 */
let cached: Resend | null | undefined;

export function getResend(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  cached = key ? new Resend(key) : null;
  return cached;
}

// Unified notifications sender. The domain venemedapp.org is verified on Resend
// (domain-level DKIM/SPF), so any @venemedapp.org from-address works.
export const EMAIL_FROM = "VeneMed <notificaciones@venemedapp.org>";
