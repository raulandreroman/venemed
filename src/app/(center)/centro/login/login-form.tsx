"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AppBar, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { finishLogin } from "../../actions/auth";

type Channel = "sms" | "whatsapp";
type Step = "phone" | "otp";

const RESEND_SECONDS = 60;
const OTP_LENGTH = 6;

/**
 * Login (L1 · Iniciar sesión → Verificar teléfono). Two-step state machine in a
 * single client component. `channel` is the swappable OTP transport (defaults to
 * "sms"; flip to "whatsapp" once the provider is enabled) — Supabase's OTP
 * `type` stays "sms" regardless of transport.
 */
export function LoginForm({ channel = "sms" }: { channel?: Channel }) {
  const [step, setStep] = useState<Step>("phone");
  const [nationalNumber, setNationalNumber] = useState("");
  const [digits, setDigits] = useState<string[]>(() =>
    Array(OTP_LENGTH).fill(""),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const phoneE164 = `+58${nationalNumber.replace(/\D/g, "")}`;
  const code = digits.join("");

  // Resend countdown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendCode = useCallback(async () => {
    const national = nationalNumber.replace(/\D/g, "");
    if (national.length < 7) {
      setError("Ingresa un número de teléfono válido.");
      return false;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { channel },
    });
    setLoading(false);
    if (sendError) {
      setError(
        sendError.status === 429
          ? "Demasiados intentos. Inténtalo de nuevo en un momento."
          : "No pudimos enviar el código. Inténtalo de nuevo en un momento.",
      );
      return false;
    }
    setResendIn(RESEND_SECONDS);
    return true;
  }, [nationalNumber, phoneE164, channel]);

  const onSubmitPhone = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const ok = await sendCode();
      if (ok) {
        setDigits(Array(OTP_LENGTH).fill(""));
        setStep("otp");
      }
    },
    [sendCode],
  );

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
        phone: phoneE164,
        token: code,
        type: "sms",
      });
      if (verifyError) {
        setLoading(false);
        setError(
          verifyError.status === 429
            ? "Demasiados intentos. Espera un momento e inténtalo de nuevo."
            : "Código incorrecto o vencido. Revisa e inténtalo de nuevo.",
        );
        return;
      }
      // Session cookie is set by the browser client. Hand off to the server
      // action: it upserts app_user, resolves membership/center, and redirects
      // to the status destination (logic stays server-side).
      await finishLogin();
    },
    [code, phoneE164],
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
      // Take the last typed char; advance focus.
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

  if (step === "phone") {
    return (
      <>
        <AppBar title="Iniciar sesión" backHref="/" />
        <form
          onSubmit={onSubmitPhone}
          className="flex flex-1 flex-col p-4"
          noValidate
        >
          <h1 className="text-2xl font-bold text-neutral-900">
            Ingresa tu teléfono
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            Te enviaremos un código por WhatsApp para entrar a tu centro.
          </p>

          <label
            htmlFor="phone"
            className="mt-6 block text-sm font-medium text-neutral-700"
          >
            Teléfono (WhatsApp)
          </label>
          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-neutral-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
            <span className="flex items-center border-r border-neutral-300 bg-neutral-50 px-3 text-[15px] font-semibold text-neutral-900">
              +58
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="412 000 0000"
              value={nationalNumber}
              onChange={(e) => setNationalNumber(e.target.value)}
              className="h-12 w-full bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300"
            />
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">
            Debe tener WhatsApp activo.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-sm text-error">
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-col items-center gap-3 pt-6">
            <Button type="submit" fullWidth disabled={loading}>
              {loading ? "Enviando…" : "Enviar código"}
            </Button>
            <p className="text-sm text-neutral-500">
              ¿No tienes cuenta?{" "}
              <Link
                href="/centro/registro"
                className="font-semibold text-accent"
              >
                Registra tu centro
              </Link>
            </p>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <AppBar title="Verificar teléfono" backHref="/" />
      <form onSubmit={onVerify} className="flex flex-1 flex-col p-4" noValidate>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
          <ChatIcon />
        </div>

        <h1 className="mt-4 text-2xl font-bold text-neutral-900">
          Ingresa el código
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Enviamos un código de 6 dígitos por WhatsApp al{" "}
          <span className="font-semibold text-neutral-900">
            {maskPhone(nationalNumber)}
          </span>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setStep("phone");
            setDigits(Array(OTP_LENGTH).fill(""));
            setError(null);
          }}
          className="mt-2 w-fit text-sm font-semibold text-accent"
        >
          Cambiar número
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
              className="h-14 w-12 rounded-xl border border-neutral-300 text-center text-xl font-semibold text-neutral-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          ))}
        </div>

        <p className="mt-3 text-sm text-neutral-500">
          ¿No te llegó?{" "}
          {resendIn > 0 ? (
            <span className="text-neutral-400">
              Reenviar en {formatCountdown(resendIn)}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={loading}
              className="font-semibold text-accent disabled:opacity-50"
            >
              Reenviar
            </button>
          )}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}

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

/** "4120000034" → "+58 412 ••• 0034" (area + masked + last 4). */
function maskPhone(national: string): string {
  const d = national.replace(/\D/g, "");
  if (d.length < 4) return "+58 ••• ••• ••••";
  const area = d.slice(0, 3);
  const last4 = d.slice(-4);
  return `+58 ${area} ••• ${last4}`;
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
