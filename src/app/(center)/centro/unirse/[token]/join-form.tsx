"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { Button } from "@/components/ui";
import { normalizeEmail } from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/client";
import { OtpStep } from "@/app/(center)/_components/otp-step";
import { acceptInvitation } from "@/app/(center)/actions/equipo";

type Step = "email" | "otp";

/**
 * Email → 6-digit-code step for accepting a team invite (mirrors
 * centro/login/login-form.tsx). The invitee may use ANY email — the link
 * itself is the credential. On a verified code, `acceptInvitation` binds the
 * membership and redirects (ends in `redirect(...)`, so `onVerified`'s bare
 * `await` needs no catch — Next applies the thrown NEXT_REDIRECT).
 */
export function JoinForm({
  token,
  inviteCard,
}: {
  token: string;
  /** Invite header card — shown on the email step, hidden during OTP entry. */
  inviteCard?: ReactNode;
}) {
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
        onVerified={() => acceptInvitation(token)}
        backHref={null}
        backToChangeNumber
      />
    );
  }

  return (
    <>
      {inviteCard}
      <form onSubmit={onSubmitEmail} className="mt-6 flex flex-1 flex-col" noValidate>
      <h2 className="text-base font-bold text-neutral-900">
        Confirma tu correo para unirte
      </h2>

      <label
        htmlFor="join-email"
        className="mt-4 block text-sm font-medium text-neutral-700"
      >
        Correo electrónico
      </label>
      <div className="mt-1.5 flex overflow-hidden rounded-xl border border-neutral-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
        <input
          id="join-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          placeholder="tucorreo@ejemplo.com"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="h-12 w-full bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}

      <Captcha ref={captchaRef} onReadyChange={setCaptchaReady} />

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button type="submit" fullWidth disabled={loading || !captchaReady}>
          {loading ? "Enviando…" : "Continuar"}
        </Button>
        <p className="text-sm text-neutral-500">
          Te enviaremos un código de acceso a tu correo.
        </p>
      </div>
      </form>
    </>
  );
}
