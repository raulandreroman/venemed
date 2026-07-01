"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button } from "@/components/ui";
import { normalizeVePhone } from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/client";
import { OtpStep } from "../../_components/otp-step";
import { finishLogin } from "../../actions/auth";

type Channel = "sms" | "whatsapp";
type Step = "phone" | "otp";

/**
 * Login (L1 · Iniciar sesión → Verificar teléfono). Two-step state machine: the
 * phone step lives here; the code step is the shared <OtpStep> (also used by the
 * registration wizard). `channel` is the swappable OTP transport (defaults to
 * "sms"; flip to "whatsapp" once the provider is enabled) — Supabase's OTP
 * `type` stays "sms" regardless of transport.
 */
export function LoginForm({ channel = "sms" }: { channel?: Channel }) {
  const [step, setStep] = useState<Step>("phone");
  const [nationalNumber, setNationalNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(!CAPTCHA_ENABLED);
  const captchaRef = useRef<CaptchaHandle>(null);

  // Canonical E.164 (+58XXXXXXXXXX), trunk-0 stripped — MUST match how
  // registration normalizes, or the same human number yields two Supabase auth
  // users (see AGENTS.md gotcha #4). null until a valid 10-digit number.
  const phoneE164 = normalizeVePhone(nationalNumber);

  const onSubmitPhone = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!phoneE164) {
        setError("Ingresa un número de teléfono válido.");
        return;
      }
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
        phone: phoneE164,
        options: { channel, captchaToken },
      });
      setLoading(false);
      if (sendError) {
        setError(
          sendError.status === 429
            ? "Demasiados intentos. Inténtalo de nuevo en un momento."
            : "No pudimos enviar el código. Inténtalo de nuevo en un momento.",
        );
        return;
      }
      setStep("otp");
    },
    [phoneE164, channel],
  );

  if (step === "otp") {
    return (
      <OtpStep
        phoneE164={phoneE164 ?? ""}
        nationalNumber={phoneE164?.slice(3) ?? ""}
        channel={channel}
        onChangeNumber={() => {
          setStep("phone");
          setError(null);
        }}
        onVerified={finishLogin}
        backHref="/"
      />
    );
  }

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

        <Captcha ref={captchaRef} onReadyChange={setCaptchaReady} />

        <div className="mt-auto flex flex-col items-center gap-3 pt-6">
          <Button type="submit" fullWidth disabled={loading || !captchaReady}>
            {loading ? "Enviando…" : "Enviar código"}
          </Button>
          <p className="text-sm text-neutral-500">
            ¿No tienes cuenta?{" "}
            <Link href="/centro/registro" className="font-semibold text-accent">
              Registra tu centro
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}
