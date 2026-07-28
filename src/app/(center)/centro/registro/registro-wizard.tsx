"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button, ConfirmDialog } from "@/components/ui";
import { OTP_COOLDOWN_SECONDS, requestOtp } from "@/lib/auth/otp-request";
import {
  normalizeEmail,
  type CreateCenterInput,
} from "@/lib/registro/validation";
import { OtpStep } from "../../_components/otp-step";
import { signOutToRegistro } from "../../actions/auth";
import { createCenterForCurrentUser } from "../../actions/registro";
import {
  CenterDatosForm,
  EMPTY_DATOS,
  type CenterDatosValues,
} from "../_components/center-datos-form";

type Mode = "anon" | "authed";
type Step = "intro" | "datos" | "otp";

export function RegistroWizard({
  mode,
  sessionEmail = null,
}: {
  mode: Mode;
  /** Verified email pinned to the session in "authed" mode (shown so the user
   * can tell which identity they are registering with, and switch away). */
  sessionEmail?: string | null;
}) {
  const [step, setStep] = useState<Step>(mode === "authed" ? "datos" : "intro");
  // Wizard owns the datos values so they survive the datos → otp → datos
  // round-trip (the shared form unmounts while the OTP step is on screen).
  const [datosValues, setDatosValues] = useState<CenterDatosValues>(EMPTY_DATOS);
  const [lastInput, setLastInput] = useState<CreateCenterInput | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(OTP_COOLDOWN_SECONDS);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(!CAPTCHA_ENABLED);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutPending, startSignOut] = useTransition();
  const captchaRef = useRef<CaptchaHandle>(null);

  const submitWrite = useCallback(async () => {
    // Server action re-validates + writes + redirects (no client navigation).
    if (!lastInput) return;
    await createCenterForCurrentUser(lastInput);
  }, [lastInput]);

  const onDatosSubmit = useCallback(
    async (input: CreateCenterInput, values: CenterDatosValues) => {
      setSendError(null);
      // Hoist the just-validated values so a return from OTP re-prefills the form.
      setDatosValues(values);
      setLastInput(input);

      if (mode === "authed") {
        // Already authenticated — no OTP, write directly (redirects).
        await createCenterForCurrentUser(input);
        return;
      }

      // Anon: send the first code to the responsable's email, then advance to
      // the shared OTP step. `collectEmail` guarantees a valid email here.
      const email = normalizeEmail(values.email);
      if (!email) {
        setSendError("Ingresa un correo electrónico válido.");
        throw new Error("invalid-email");
      }
      setOtpEmail(email);
      const result = await requestOtp({
        email,
        getCaptchaToken: () =>
          captchaRef.current?.getToken() ?? Promise.resolve(undefined),
      });
      if (result.status === "error" && !result.codeAlreadySent) {
        setSendError(result.message);
        // Keep the form mounted; the shared form's finally re-enables the button.
        throw new Error("otp-send-failed");
      }
      // Reused / already-sent code: advance anyway so a datos → otp → datos
      // round-trip inside the 60s window can still finish with the live code.
      setOtpCooldown(result.cooldown);
      setOtpNotice(result.status === "error" ? result.message : result.notice);
      setStep("otp");
    },
    [mode],
  );

  // ── Step: OTP (anon only) ────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <OtpStep
        email={otpEmail}
        backToChangeNumber
        onChangeNumber={() => setStep("datos")}
        onVerified={submitWrite}
        initialResendIn={otpCooldown}
        notice={otpNotice}
        stepLabel="2 de 3"
        progressSlot={<Stepper current={2} label="Verifica tu correo" />}
      />
    );
  }

  // ── Step: Intro (R0) ─────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <>
        {/* R0 is entered from the public home CTA, so back returns there —
            not to login, which is a sibling entry point, not the parent. */}
        <AppBar title="Registro" backHref="/" />
        <main className="flex flex-1 flex-col px-6 pb-6 pt-2">
          {/* Centered composition (medallion → título → qué pedimos), with the
              action block pinned to the bottom. */}
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-28 items-center justify-center rounded-full bg-accent-subtle">
              <span className="flex size-[72px] items-center justify-center rounded-[20px] bg-accent text-accent-on">
                <PlusIcon />
              </span>
            </span>

            <h1 className="mt-8 text-2xl font-bold leading-tight text-neutral-900">
              Crea la cuenta de tu centro
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
              Solo te pediremos datos básicos y la verificación de tu correo
              electrónico.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 pt-8">
            <p className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-border bg-accent-subtle px-4 py-3.5 text-[15px] font-semibold text-accent">
              <ClockIcon />
              Toma menos de 5 minutos
            </p>
            <Button type="button" fullWidth onClick={() => setStep("datos")}>
              Comenzar
            </Button>
            <Link
              href="/centro/login"
              className="text-sm font-semibold text-accent"
            >
              Ya tengo cuenta · Iniciar sesión
            </Link>
          </div>
        </main>
      </>
    );
  }

  // ── Step: Datos ──────────────────────────────────────────────────────────
  return (
    <>
      <AppBar
        title="Registro"
        // "authed" mode has no earlier step to go back to — the session pins the
        // email — so the affordance is an ✕ that signs out instead.
        backIcon={mode === "authed" ? "close" : "arrow"}
        onBack={
          mode === "authed"
            ? () => setSignOutOpen(true)
            : () => setStep("intro")
        }
        trailing={<span className="text-sm text-neutral-400">1 de 3</span>}
      />
      <ConfirmDialog
        open={signOutOpen}
        title="¿Cerrar sesión?"
        body={
          sessionEmail
            ? `Saldrás de la cuenta de ${sessionEmail} y podrás registrarte con otro correo.`
            : "Saldrás de tu cuenta y podrás registrarte con otro correo."
        }
        confirmLabel="Cerrar sesión"
        pending={signOutPending}
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() =>
          startSignOut(async () => {
            await signOutToRegistro();
          })
        }
      />
      <CenterDatosForm
        initialValues={datosValues}
        collectEmail={mode === "anon"}
        submitLabel="Continuar"
        submitPendingLabel="Enviando…"
        headerSlot={<Stepper current={1} label="Datos del centro" />}
        footerNote={
          <>
            Paso 1 de 3 ·{" "}
            <Link href="/privacidad" className="font-medium text-accent">
              Tus datos están protegidos
            </Link>
          </>
        }
        footerError={sendError}
        footerSlot={
          mode === "anon" ? (
            <Captcha ref={captchaRef} onReadyChange={setCaptchaReady} />
          ) : null
        }
        submitDisabled={mode === "anon" && !captchaReady}
        onSubmit={onDatosSubmit}
      />
    </>
  );
}

// ── Registration-specific chrome ────────────────────────────────────────────

function Stepper({ current, label }: { current: 1 | 2 | 3; label: string }) {
  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full ${
              n <= current ? "bg-accent" : "bg-neutral-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-neutral-500">
        Paso {current} · {label}
      </p>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
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
