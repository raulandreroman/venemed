"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Minimum interval Supabase Auth enforces between two OTP sends to the SAME
 * address (GOTRUE_SMTP_MAX_FREQUENCY, 60s by default). Sending inside that
 * window returns 429 `over_email_send_rate_limit`, so we track our own sends
 * and reuse the still-valid code instead of asking for a new one.
 */
export const OTP_COOLDOWN_SECONDS = 60;

const STORAGE_KEY = "venemed:otp-sent-at";

/**
 * Last-send timestamps keyed by normalized email. Kept in sessionStorage so a
 * back-navigation, a step remount, or a tab reload still knows a code is live.
 * The in-memory map is the fallback when storage is unavailable (private mode).
 */
const memory = new Map<string, number>();

function readStore(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function lastSentAt(email: string): number | undefined {
  return readStore()[email] ?? memory.get(email);
}

function markSent(email: string, at: number) {
  memory.set(email, at);
  try {
    // Prune stale entries so the record can't grow unbounded in a long session.
    const store = readStore();
    for (const [key, ts] of Object.entries(store)) {
      if (at - ts > OTP_COOLDOWN_SECONDS * 1000) delete store[key];
    }
    store[email] = at;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // sessionStorage unavailable — the in-memory map still covers this tab.
  }
}

/** Whole seconds left before a new code may be requested for `email` (0 = now). */
export function remainingCooldown(email: string): number {
  const at = lastSentAt(email);
  if (!at) return 0;
  const elapsed = (Date.now() - at) / 1000;
  return Math.max(0, Math.ceil(OTP_COOLDOWN_SECONDS - elapsed));
}

/** Supabase spells the per-address wait into the message: "…after 43 seconds". */
function parseRetrySeconds(message: string | undefined): number | undefined {
  const match = message?.match(/(\d+)\s*second/i);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export type OtpRequestResult =
  | {
      /** A code is on its way (`sent`) or already in the inbox (`reused`). */
      status: "sent" | "reused";
      /** Seconds until another code may be requested. */
      cooldown: number;
      /** Copy to surface on the code step; null when a fresh code just went out. */
      notice: string | null;
    }
  | {
      status: "error";
      /** `cooldown` reflects an accepted earlier send when Supabase 429s. */
      cooldown: number;
      message: string;
      /** True when the address already has a live code — safe to show the code step. */
      codeAlreadySent: boolean;
    };

/**
 * Request an email OTP, coalescing repeat requests for the same address.
 *
 * Callers advance to the code step on `sent` / `reused`, and also on an `error`
 * with `codeAlreadySent` (a 429 means a code went out moments ago — pushing the
 * user back to the email field would strand them with no way forward).
 */
export async function requestOtp({
  email,
  getCaptchaToken,
}: {
  email: string;
  getCaptchaToken?: () => Promise<string | undefined>;
}): Promise<OtpRequestResult> {
  const cooldown = remainingCooldown(email);
  if (cooldown > 0) {
    return {
      status: "reused",
      cooldown,
      notice: "Ya te enviamos un código a este correo. Revisa tu bandeja (y el spam).",
    };
  }

  let captchaToken: string | undefined;
  try {
    captchaToken = await getCaptchaToken?.();
  } catch {
    return {
      status: "error",
      cooldown: 0,
      codeAlreadySent: false,
      message:
        "No pudimos verificar que no eres un robot. Recarga e inténtalo de nuevo.",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { captchaToken },
  });

  if (!error) {
    markSent(email, Date.now());
    return { status: "sent", cooldown: OTP_COOLDOWN_SECONDS, notice: null };
  }

  if (error.status === 429) {
    // A 429 on send means Supabase already accepted a recent code for this
    // address. Backdate our record so the countdown matches its window.
    const retryIn = parseRetrySeconds(error.message) ?? OTP_COOLDOWN_SECONDS;
    markSent(email, Date.now() - (OTP_COOLDOWN_SECONDS - retryIn) * 1000);
    return {
      status: "error",
      cooldown: retryIn,
      codeAlreadySent: true,
      message:
        "Ya te enviamos un código hace poco. Revisa tu correo (y el spam) e ingrésalo aquí.",
    };
  }

  return {
    status: "error",
    cooldown: 0,
    codeAlreadySent: false,
    message: "No pudimos enviar el código. Inténtalo de nuevo en un momento.",
  };
}
