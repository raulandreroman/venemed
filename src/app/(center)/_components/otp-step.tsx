"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const RESEND_SECONDS = 60;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 15 * 60; // display-only; Supabase enforces the real window

export type OtpStepProps = {
  /** Email address to verify (also the OTP send/resend target). */
  email: string;
  /** "Cambiar correo" — caller decides where back goes (login: email step;
   * registro: datos step). Also used by the AppBar back arrow + the lockout
   * "Verificar con otro correo" action. */
  onChangeNumber: () => void;
  /** Success handoff (login: finishLogin; registro: createCenterForCurrentUser). */
  onVerified: () => void | Promise<void>;
  /** AppBar title (default "Verificar correo"). */
  title?: string;
  /** AppBar back arrow target. Ignored when `onChangeNumber` drives the arrow. */
  backHref?: string | null;
  /** When true, the AppBar back arrow calls `onChangeNumber` (no navigation). */
  backToChangeNumber?: boolean;
  /** AppBar trailing label, e.g. "2 de 3" (registro). */
  stepLabel?: string;
  /** Optional progress region rendered under the AppBar (registro stepper). */
  progressSlot?: ReactNode;
};

/**
 * Shared OTP-entry step (extracted from the Phase 1 login form). Owns the 6-box
 * code input, resend countdown, attempt budget and lockout UI. The CALLER sends
 * the first code (so it controls timing); this step seeds the resend countdown
 * on mount and exposes an in-step "Reenviar".
 */
export function OtpStep({
  email,
  onChangeNumber,
  onVerified,
  title = "Verificar correo",
  backHref = "/",
  backToChangeNumber = false,
  stepLabel,
  progressSlot,
}: OtpStepProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array(OTP_LENGTH).fill(""),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [locked, setLocked] = useState(false);
  const [lockIn, setLockIn] = useState(0);
  const [captchaReady, setCaptchaReady] = useState(!CAPTCHA_ENABLED);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const captchaRef = useRef<CaptchaHandle>(null);
  const code = digits.join("");

  // Resend countdown tick (Phase 1 pattern — safe in an effect).
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Lockout countdown tick.
  useEffect(() => {
    if (!locked || lockIn <= 0) return;
    const t = setInterval(() => setLockIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [locked, lockIn]);

  const enterLockout = useCallback(() => {
    setLocked(true);
    setLockIn(LOCKOUT_SECONDS);
    setError(null);
  }, []);

  const resend = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    let captchaToken: string | undefined;
    try {
      captchaToken = await captchaRef.current?.getToken();
    } catch {
      setLoading(false);
      setError("No pudimos verificar que no eres un robot. Recarga e inténtalo de nuevo.");
      return;
    }
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { captchaToken },
    });
    setLoading(false);
    if (sendError) {
      if (sendError.status === 429) {
        enterLockout();
        return;
      }
      setError("No pudimos enviar el código. Inténtalo de nuevo en un momento.");
      return;
    }
    setResendIn(RESEND_SECONDS);
  }, [email, enterLockout]);

  const onVerify = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (code.length !== OTP_LENGTH) {
        setError("Ingresa los 6 dígitos del código.");
        return;
      }
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (verifyError) {
        setLoading(false);
        const remaining = attemptsLeft - 1;
        setAttemptsLeft(remaining);
        if (verifyError.status === 429 || remaining <= 0) {
          enterLockout();
          return;
        }
        setError(`Código incorrecto. Te quedan ${remaining} intentos.`);
        return;
      }
      // Session cookie set by the browser client; hand off to the caller.
      await onVerified();
    },
    [code, email, attemptsLeft, enterLockout, onVerified],
  );

  const setDigitAt = useCallback((i: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }, []);

  const onDigitChange = useCallback(
    (i: number) => (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, "");
      if (!v) {
        setDigitAt(i, "");
        return;
      }
      setDigitAt(i, v[v.length - 1]);
      if (i < OTP_LENGTH - 1) otpRefs.current[i + 1]?.focus();
    },
    [setDigitAt],
  );

  const onDigitKeyDown = useCallback(
    (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !digits[i] && i > 0) {
        otpRefs.current[i - 1]?.focus();
      }
    },
    [digits],
  );

  const onOtpPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }, []);

  const appBar = (
    <AppBar
      title={title}
      backHref={backToChangeNumber ? undefined : backHref}
      onBack={backToChangeNumber ? onChangeNumber : undefined}
      trailing={
        stepLabel ? (
          <span className="text-sm text-neutral-400">{stepLabel}</span>
        ) : undefined
      }
    />
  );

  // ── Intentos agotados (lockout) ──────────────────────────────────────────
  if (locked) {
    return (
      <>
        {appBar}
        <main className="flex flex-1 flex-col p-4">
          {progressSlot}
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error">
            <LockIcon />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-neutral-900">
            Demasiados intentos
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            Por tu seguridad bloqueamos la verificación temporalmente tras
            varios códigos incorrectos.
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-neutral-50 p-4">
            <span className="mt-0.5 text-neutral-400">
              <ClockIcon />
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                Podrás reintentar en {formatCountdown(lockIn)}
              </p>
              <p className="mt-0.5 text-sm text-neutral-500">
                Mantén esta pantalla abierta.
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 pt-6">
            <Button type="button" fullWidth disabled>
              Reenviar código
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={onChangeNumber}
            >
              Verificar con otro correo
            </Button>
          </div>
        </main>
      </>
    );
  }

  const hasCodeError = error?.startsWith("Código incorrecto");

  // ── Ingresa el código ────────────────────────────────────────────────────
  return (
    <>
      {appBar}
      <form onSubmit={onVerify} className="flex flex-1 flex-col p-4" noValidate>
        {progressSlot}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
          <ChatIcon />
        </div>

        <h1 className="mt-4 text-2xl font-bold text-neutral-900">
          Ingresa el código
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Enviamos un código de 6 dígitos a{" "}
          <span className="font-semibold text-neutral-900">
            {maskEmail(email)}
          </span>
          .
        </p>
        <button
          type="button"
          onClick={onChangeNumber}
          className="mt-2 w-fit text-sm font-semibold text-accent"
        >
          Cambiar correo
        </button>

        <div className="mt-5 flex justify-between gap-2" onPaste={onOtpPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                otpRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={d}
              aria-label={`Dígito ${i + 1}`}
              onChange={onDigitChange(i)}
              onKeyDown={onDigitKeyDown(i)}
              className={`h-14 w-12 rounded-xl border text-center text-xl font-semibold text-neutral-900 outline-none focus:ring-2 ${
                hasCodeError
                  ? "border-error focus:border-error focus:ring-error/30"
                  : "border-neutral-300 focus:border-accent focus:ring-accent/30"
              }`}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-error">
            {hasCodeError && <ErrorDot />}
            {error}
          </p>
        )}

        <p className="mt-3 text-sm text-neutral-500">
          ¿No te llegó?{" "}
          {resendIn > 0 ? (
            <span className="text-neutral-400">
              Reenviar en {formatCountdown(resendIn)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={loading || !captchaReady}
              className="font-semibold text-accent disabled:opacity-50"
            >
              Reenviar código
            </button>
          )}
        </p>

        <Captcha ref={captchaRef} onReadyChange={setCaptchaReady} />

        <div className="mt-auto flex flex-col items-center gap-3 pt-6">
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Verificando…" : "Verificar"}
          </Button>
          <p className="text-sm text-neutral-500">
            No compartas este código con nadie.
          </p>
        </div>
      </form>
    </>
  );
}

/** "coordinadora@centro.org" → "co•••@centro.org" (first 2 chars + domain). */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${local.length > 2 ? "•••" : ""}@${domain}`;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ChatIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ErrorDot() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d="M12 7v6"
        stroke="var(--color-surface, #fff)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="1.2" fill="var(--color-surface, #fff)" />
    </svg>
  );
}
