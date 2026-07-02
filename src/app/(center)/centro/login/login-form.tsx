"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button } from "@/components/ui";
import { normalizeEmail } from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/client";
import { OtpStep } from "../../_components/otp-step";
import { finishLogin } from "../../actions/auth";

type Step = "email" | "otp";

/**
 * Login (L1 · Iniciar sesión → Verificar correo). Two-step state machine: the
 * email step lives here; the code step is the shared <OtpStep> (also used by the
 * registration wizard). Auth is email OTP (Supabase `type: "email"`).
 */
export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(!CAPTCHA_ENABLED);
  const captchaRef = useRef<CaptchaHandle>(null);

  const email = normalizeEmail(emailInput);

  const onSubmitEmail = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!email) {
        setError("Ingresa un correo electrónico válido.");
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
        email,
        options: { captchaToken },
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
    [email],
  );

  if (step === "otp") {
    return (
      <OtpStep
        email={email ?? ""}
        onChangeNumber={() => {
          setStep("email");
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
        onSubmit={onSubmitEmail}
        className="flex flex-1 flex-col p-4"
        noValidate
      >
        <h1 className="text-2xl font-bold text-neutral-900">
          Ingresa tu correo
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          Te enviaremos un código por correo para entrar a tu centro.
        </p>

        <label
          htmlFor="email"
          className="mt-6 block text-sm font-medium text-neutral-700"
        >
          Correo electrónico
        </label>
        <div className="mt-2 flex overflow-hidden rounded-md border-[1.5px] border-neutral-300 focus-within:border-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="tucentro@correo.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="h-[52px] w-full bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>

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
