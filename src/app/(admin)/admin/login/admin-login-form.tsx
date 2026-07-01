"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button } from "@/components/ui";
import { normalizeVePhone } from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/client";

import { finishLogin } from "../../../(center)/actions/auth";
import { OtpStep } from "../../../(center)/_components/otp-step";

type Channel = "sms" | "whatsapp";
type Step = "phone" | "otp";

/**
 * A1 · Admin login phone step (Figma `53:1361`). A copy-variant of the center
 * `login-form.tsx`: same two-step machine and the SHARED <OtpStep>, but with
 * moderator copy + an "Acceso de moderador" badge, and NO registration CTA
 * (admins can't self-register). Post-verify it calls the existing `finishLogin`
 * action, whose `resolveLoginDestination()` short-circuits admins to /admin.
 */
export function AdminLoginForm({ channel = "sms" }: { channel?: Channel }) {
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
      <AppBar title="" backHref="/" />
      <form
        onSubmit={onSubmitPhone}
        className="flex flex-1 flex-col p-4"
        noValidate
      >
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-sm font-semibold text-accent">
          <ShieldIcon />
          Acceso de moderador
        </span>

        <h1 className="mt-4 text-2xl font-bold text-neutral-900">
          Ingresa tu teléfono
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Te enviaremos un código por WhatsApp para entrar a tu cuenta de
          moderación.
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
          Debe ser el número registrado como moderador.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}

        <Captcha ref={captchaRef} onReadyChange={setCaptchaReady} />

        <div className="mt-auto pt-6">
          <Button type="submit" fullWidth disabled={loading || !captchaReady}>
            {loading ? "Enviando…" : "Enviar código"}
          </Button>
        </div>
      </form>
    </>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
