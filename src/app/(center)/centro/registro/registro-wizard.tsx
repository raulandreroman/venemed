"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { AppBar, Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  CENTER_TYPE_OPTIONS,
  normalizeVePhone,
  validateRegistro,
  VE_STATES,
  type CenterType,
  type CreateCenterInput,
  type FieldErrors,
} from "@/lib/registro/validation";
import { OtpStep } from "../../_components/otp-step";
import { createCenterForCurrentUser } from "../../actions/registro";

type Channel = "sms" | "whatsapp";
type Mode = "anon" | "authed";
type Step = "intro" | "datos" | "otp";

type FormData = {
  name: string;
  type: CenterType | "";
  state: string;
  city: string;
  addressLine: string;
  addressReference: string;
  regularScheduleText: string;
  nationalPhone: string;
  responsibleName: string;
};

const EMPTY: FormData = {
  name: "",
  type: "",
  state: "",
  city: "",
  addressLine: "",
  addressReference: "",
  regularScheduleText: "",
  nationalPhone: "",
  responsibleName: "",
};

/** Map the wizard's form state to the validated/server payload shape. The phone
 * is normalized to E.164; an invalid phone yields "" so the validator flags it. */
function toInput(d: FormData): CreateCenterInput {
  return {
    name: d.name,
    type: d.type as CenterType,
    state: d.state,
    city: d.city,
    addressLine: d.addressLine,
    addressReference: d.addressReference || undefined,
    regularScheduleText: d.regularScheduleText || undefined,
    whatsappPhone: normalizeVePhone(d.nationalPhone) ?? d.nationalPhone,
    responsibleName: d.responsibleName,
  };
}

export function RegistroWizard({
  mode,
  defaultPhone,
  channel = "sms",
}: {
  mode: Mode;
  /** Verified session phone (E.164) for the authed no-membership flow. */
  defaultPhone?: string | null;
  channel?: Channel;
}) {
  const lockedNational =
    mode === "authed" && defaultPhone
      ? defaultPhone.replace(/\D/g, "").replace(/^58/, "")
      : "";

  const [step, setStep] = useState<Step>(mode === "authed" ? "datos" : "intro");
  const [data, setData] = useState<FormData>({
    ...EMPTY,
    nationalPhone: lockedNational,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const set = useCallback(
    (key: keyof FormData) =>
      (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setData((prev) => ({ ...prev, [key]: value }));
      },
    [],
  );

  const phoneE164 = normalizeVePhone(data.nationalPhone) ?? "";

  const submitWrite = useCallback(async () => {
    // Server action re-validates + writes + redirects (no client navigation).
    await createCenterForCurrentUser(toInput(data));
  }, [data]);

  const onContinue = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSendError(null);
      const found = validateRegistro(toInput(data));
      if (Object.keys(found).length > 0) {
        setErrors(found);
        if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        return;
      }
      setErrors({});

      if (mode === "authed") {
        // Already verified — no OTP, write directly.
        setLoading(true);
        await submitWrite();
        return;
      }

      // Anon: send the first code, then advance to the shared OTP step.
      setLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneE164,
        options: { channel },
      });
      setLoading(false);
      if (error) {
        setSendError(
          error.status === 429
            ? "Demasiados intentos. Inténtalo de nuevo en un momento."
            : "No pudimos enviar el código. Inténtalo de nuevo en un momento.",
        );
        return;
      }
      setStep("otp");
    },
    [data, mode, phoneE164, channel, submitWrite],
  );

  // ── Step: OTP (anon only) ────────────────────────────────────────────────
  if (step === "otp") {
    return (
      <OtpStep
        phoneE164={phoneE164}
        nationalNumber={data.nationalPhone.replace(/\D/g, "")}
        channel={channel}
        backToChangeNumber
        onChangeNumber={() => setStep("datos")}
        onVerified={submitWrite}
        stepLabel="2 de 3"
        progressSlot={<Stepper current={2} label="Verifica tu teléfono" />}
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
              title="Un teléfono con WhatsApp"
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
  const errorCount = Object.keys(errors).length;
  return (
    <>
      <AppBar
        title="Registrar centro"
        backHref={mode === "authed" ? null : undefined}
        onBack={mode === "authed" ? undefined : () => setStep("intro")}
        trailing={<span className="text-sm text-neutral-400">1 de 3</span>}
      />
      <form onSubmit={onContinue} className="flex flex-1 flex-col p-4" noValidate>
        <Stepper current={1} label="Datos del centro" />

        {errorCount > 0 && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-xl border border-error/40 bg-error/5 p-4"
          >
            <span className="mt-0.5 text-error">
              <ErrorIcon />
            </span>
            <div>
              <p className="text-sm font-bold text-error">
                {errorCount === 1
                  ? "Falta 1 dato por corregir"
                  : `Faltan ${errorCount} datos por corregir`}
              </p>
              <p className="mt-0.5 text-sm text-neutral-600">
                Revisa los campos marcados en rojo para continuar.
              </p>
            </div>
          </div>
        )}

        <h2 className="mt-6 text-lg font-bold text-neutral-900">
          Datos del centro
        </h2>

        <TextField
          id="name"
          label="Nombre del centro"
          placeholder="Ej: Hospital Universitario de Caracas"
          hint="Tal como aparece en el documento legal"
          value={data.name}
          onChange={set("name")}
          error={errors.name}
        />

        <SelectField
          id="type"
          label="Tipo de centro"
          value={data.type}
          onChange={set("type")}
          error={errors.type}
          placeholder="Selecciona el tipo"
          options={CENTER_TYPE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
        />

        <SelectField
          id="state"
          label="Estado"
          value={data.state}
          onChange={set("state")}
          error={errors.state}
          placeholder="Selecciona el estado"
          options={VE_STATES.map((s) => ({ value: s, label: s }))}
        />

        <TextField
          id="city"
          label="Ciudad"
          placeholder="Ej: Caracas"
          value={data.city}
          onChange={set("city")}
          error={errors.city}
        />

        <TextField
          id="addressLine"
          label="Dirección"
          placeholder="Av. Principal, sector"
          hint="Dónde se recibirán las donaciones"
          value={data.addressLine}
          onChange={set("addressLine")}
          error={errors.addressLine}
        />

        <TextField
          id="addressReference"
          label="Referencia (opcional)"
          placeholder="Punto de referencia cercano"
          value={data.addressReference}
          onChange={set("addressReference")}
          error={errors.addressReference}
        />

        <TextField
          id="regularScheduleText"
          label="Horario de atención (opcional)"
          placeholder="Ej: Lun a Vie, 8am–4pm"
          value={data.regularScheduleText}
          onChange={set("regularScheduleText")}
          error={errors.regularScheduleText}
        />

        <PhoneField
          value={data.nationalPhone}
          onChange={set("nationalPhone")}
          error={errors.whatsappPhone}
          locked={mode === "authed"}
        />

        <h2 className="mt-8 text-lg font-bold text-neutral-900">
          Persona responsable
        </h2>

        <TextField
          id="responsibleName"
          label="Nombre y apellido"
          placeholder="Quién coordina las donaciones"
          value={data.responsibleName}
          onChange={set("responsibleName")}
          error={errors.responsibleName}
        />

        {sendError && (
          <p role="alert" className="mt-4 text-sm text-error">
            {sendError}
          </p>
        )}

        <div className="mt-auto flex flex-col items-center gap-3 pt-8">
          <p className="text-xs text-neutral-500">
            Paso 1 de 3 · Tus datos están protegidos
          </p>
          <Button type="submit" fullWidth disabled={loading}>
            {loading ? "Enviando…" : "Continuar"}
          </Button>
        </div>
      </form>
    </>
  );
}

// ── Presentational fields ──────────────────────────────────────────────────

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="mt-5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-700"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`mt-1.5 h-12 w-full rounded-xl border bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 focus:ring-2 ${
          error
            ? "border-error focus:border-error focus:ring-error/30"
            : "border-neutral-300 focus:border-accent focus:ring-accent/30"
        }`}
      />
      {error ? (
        <p className="mt-1.5 text-sm text-error">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="mt-5">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-700"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        className={`mt-1.5 h-12 w-full appearance-none rounded-xl border bg-surface bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-3 pr-10 text-[15px] outline-none focus:ring-2 ${
          value ? "text-neutral-900" : "text-neutral-300"
        } ${
          error
            ? "border-error focus:border-error focus:ring-error/30"
            : "border-neutral-300 focus:border-accent focus:ring-accent/30"
        }`}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23737373' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-neutral-900">
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-sm text-error">{error}</p>}
    </div>
  );
}

function PhoneField({
  value,
  onChange,
  error,
  locked,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  locked?: boolean;
}) {
  return (
    <div className="mt-5">
      <label
        htmlFor="whatsappPhone"
        className="block text-sm font-medium text-neutral-700"
      >
        Teléfono (WhatsApp)
      </label>
      <div
        className={`mt-1.5 flex overflow-hidden rounded-xl border ${
          error
            ? "border-error focus-within:ring-2 focus-within:ring-error/30"
            : "border-neutral-300 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
        } ${locked ? "opacity-70" : ""}`}
      >
        <span className="flex items-center border-r border-neutral-300 bg-neutral-50 px-3 text-[15px] font-semibold text-neutral-900">
          +58
        </span>
        <input
          id="whatsappPhone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="412 000 0000"
          value={value}
          onChange={onChange}
          disabled={locked}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 disabled:bg-neutral-50"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-error">{error}</p>
      ) : locked ? (
        <p className="mt-1.5 text-xs text-neutral-500">
          Verificado en tu sesión.
        </p>
      ) : null}
    </div>
  );
}

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

function ErrorIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1.2" fill="#fff" />
    </svg>
  );
}
