"use client";

import {
  Turnstile,
  type TurnstileInstance,
} from "@marsidev/react-turnstile";
import { forwardRef, useImperativeHandle, useRef } from "react";

// Public site key. When unset (local dev + CI, where Supabase Auth has captcha
// disabled and the offline test_otp map handles OTP), the widget renders nothing
// and getToken() resolves undefined — so the OTP flow keeps working without a
// captcha. In prod the key is set and Supabase enforces the token server-side.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Whether the captcha is active in this build. Forms use it to decide the
 * initial "ready" state of their send button: when captcha is disabled
 * (local/CI), the button is enabled from the start; when enabled, it stays
 * disabled until the widget solves (onReadyChange(true)).
 */
export const CAPTCHA_ENABLED = Boolean(SITE_KEY);

export type CaptchaHandle = {
  /**
   * Resolve a fresh, single-use Turnstile token to pass as `captchaToken` to
   * `signInWithOtp`. Returns undefined when captcha is disabled (no site key).
   * Resets the widget after the first use so each OTP send gets a new token
   * (tokens are single-use). May reject if the challenge times out / errors —
   * callers treat that as a failed send.
   */
  getToken: () => Promise<string | undefined>;
};

/**
 * Cloudflare Turnstile, wired for the phone-OTP flow (audit issue #22). Mounted
 * on each phone-entry step and inside <OtpStep> (for "Reenviar"), since those
 * steps are mutually exclusive and every `signInWithOtp` needs its own token.
 */
export type CaptchaProps = {
  /**
   * Fires true once the challenge is solved (token available) and false when it
   * expires or errors. Lets the caller gate its send button on a green captcha.
   * Never fires when captcha is disabled — callers default to ready in that case
   * (see CAPTCHA_ENABLED).
   */
  onReadyChange?: (ready: boolean) => void;
};

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onReadyChange },
  ref,
) {
  const instance = useRef<TurnstileInstance | null>(null);
  const consumed = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      async getToken() {
        if (!SITE_KEY || !instance.current) return undefined;
        // The widget auto-solves once on mount; the first call awaits that
        // token. Every later call must reset first — the prior token is spent.
        if (consumed.current) instance.current.reset();
        consumed.current = true;
        return (await instance.current.getResponsePromise()) ?? undefined;
      },
    }),
    [],
  );

  if (!SITE_KEY) return null;

  return (
    <div className="mt-4">
      <Turnstile
        ref={instance}
        siteKey={SITE_KEY}
        options={{ size: "flexible" }}
        onSuccess={() => onReadyChange?.(true)}
        onError={() => onReadyChange?.(false)}
        onExpire={() => onReadyChange?.(false)}
      />
    </div>
  );
});
