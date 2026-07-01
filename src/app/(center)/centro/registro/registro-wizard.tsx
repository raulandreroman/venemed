"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Captcha, CAPTCHA_ENABLED, type CaptchaHandle } from "@/components/captcha";
import { AppBar, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  normalizeEmail,
  type CreateCenterInput,
} from "@/lib/registro/validation";
import { OtpStep } from "../../_components/otp-step";
import { createCenterForCurrentUser } from "../../actions/registro";
import {
  CenterDatosForm,
  EMPTY_DATOS,
  type CenterDatosValues,
} from "../_components/center-datos-form";

type Mode = "anon" | "authed";
type Step = "intro" | "datos" | "otp";

export function RegistroWizard({ mode }: { mode: Mode }) {
  const [step, setStep] = useState<Step>(mode === "authed" ? "datos" : "intro");
  // Wizard owns the datos values so they survive the datos → otp → datos
  // round-trip (the shared form unmounts while the OTP step is on screen).
  const [datosValues, setDatosValues] = useState<CenterDatosValues>(EMPTY_DATOS);
  const [lastInput, setLastInput] = useState<CreateCenterInput | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(!CAPTCHA_ENABLED);
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
      const supabase = createClient();
      let captchaToken: string | undefined;
      try {
        captchaToken = await captchaRef.current?.getToken();
      } catch {
        setSendError(
          "No pudimos verificar que no eres un robot. Recarga e inténtalo de nuevo.",
        );
        throw new Error("captcha-failed");
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { captchaToken },
      });
      if (error) {
        setSendError(
          error.status === 429
            ? "Demasiados intentos. Inténtalo de nuevo en un momento."
            : "No pudimos enviar el código. Inténtalo de nuevo en un momento.",
        );
        // Keep the form mounted; the shared form's finally re-enables the button.
        throw new Error("otp-send-failed");
      }
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
        stepLabel="2 de 3"
        progressSlot={<Stepper current={2} label="Verifica tu correo" />}
      />
    );
  }

  // ── Step: Intro (R0) ─────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <>
        <AppBar title="Registrar centro" backHref="/centro/login" />
        <main className="flex flex-1 flex-col p-4">
          <h1 className="text-2xl font-bold text-neutral-900">
            Crea la cuenta de tu centro
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
            En pocos minutos podrás publicar lo que tu centro necesita.
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            <Benefit
              icon={<BuildingIcon />}
              title="Datos básicos del centro"
              desc="Nombre, ubicación y responsable."
            />
            <Benefit
              icon={<PhoneIcon />}
              title="Un correo electrónico"
              desc="Lo verificamos con un código."
            />
            <Benefit
              icon={<ClockIcon />}
              title="Unos 2 a 3 minutos"
              desc="Puedes pausar y seguir después."
            />
          </ul>

          <div className="mt-5 rounded-xl border-l-4 border-accent bg-neutral-50 p-4">
            <p className="text-sm leading-relaxed text-neutral-700">
              Verificaremos tu centro antes de activarlo, para proteger la red
              de ayuda.
            </p>
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 pt-6">
            <Button type="button" fullWidth onClick={() => setStep("datos")}>
              Comenzar
            </Button>
            <p className="text-sm text-neutral-500">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/centro/login"
                className="font-semibold text-accent"
              >
                Iniciar sesión
              </Link>
            </p>
          </div>
        </main>
      </>
    );
  }

  // ── Step: Datos ──────────────────────────────────────────────────────────
  return (
    <>
      <AppBar
        title="Registrar centro"
        backHref={mode === "authed" ? null : undefined}
        onBack={mode === "authed" ? undefined : () => setStep("intro")}
        trailing={<span className="text-sm text-neutral-400">1 de 3</span>}
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

function Benefit({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-accent">
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-neutral-900">
          {title}
        </span>
        <span className="block text-sm text-neutral-500">{desc}</span>
      </span>
    </li>
  );
}

function BuildingIcon() {
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
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 9h.01M15 9h.01" />
    </svg>
  );
}

function PhoneIcon() {
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
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
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
