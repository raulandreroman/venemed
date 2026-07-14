"use client";

import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import {
  CENTER_TYPE_OPTIONS,
  normalizeEmail,
  normalizeVePhone,
  validateRegistro,
  VE_STATES,
  type CenterType,
  type CreateCenterInput,
  type FieldErrors,
} from "@/lib/registro/validation";

/** Raw field state for the "Datos del centro + Persona responsable" form. The
 * phone is national digits only ("412 000 0000"); "" when unknown. `email` is
 * the responsable's login identity, only collected during registration. */
export type CenterDatosValues = {
  name: string;
  type: CenterType | "";
  state: string;
  city: string;
  addressLine: string;
  addressReference: string;
  regularScheduleText: string;
  nationalPhone: string;
  email: string;
  responsibleName: string;
  cargo: string;
};

export const EMPTY_DATOS: CenterDatosValues = {
  name: "",
  type: "",
  state: "",
  city: "",
  addressLine: "",
  addressReference: "",
  regularScheduleText: "",
  nationalPhone: "",
  email: "",
  responsibleName: "",
  cargo: "",
};

/** Map the form state to the validated/server payload shape. WhatsApp is now an
 * OPTIONAL contact field: blank → undefined; otherwise normalized to E.164 (an
 * invalid value passes through raw so the validator flags it). */
export function toInput(d: CenterDatosValues): CreateCenterInput {
  const rawPhone = d.nationalPhone.trim();
  return {
    name: d.name,
    // Center-type feature off → the field isn't shown and we store no type (null).
    type: CENTER_TYPE_ENABLED ? (d.type as CenterType) : null,
    state: d.state,
    city: d.city,
    addressLine: d.addressLine,
    addressReference: d.addressReference || undefined,
    regularScheduleText: d.regularScheduleText || undefined,
    whatsappPhone: rawPhone
      ? (normalizeVePhone(rawPhone) ?? rawPhone)
      : undefined,
    responsibleName: d.responsibleName,
    cargo: d.cargo || undefined,
  };
}

/**
 * Shared "Datos del centro + Persona responsable" form, consumed by BOTH the
 * registration wizard (create) and the edit page (edit). It owns local field
 * state, validation, and the error-count alert. The PARENT owns what happens on
 * a valid submit (`onSubmit`), the header chrome (`headerSlot`, e.g. the wizard
 * stepper), and any cross-cutting send/save error (`footerError`).
 *
 * State ownership caveat: `initialValues` only seeds the internal state on
 * mount. A parent that early-returns (unmounting this form — e.g. the wizard
 * rendering the OTP step) MUST keep entered values in its own state and pass
 * them back as `initialValues` on remount; this form does not persist across
 * unmount.
 */
export function CenterDatosForm({
  initialValues,
  collectEmail = false,
  submitLabel,
  submitPendingLabel,
  onSubmit,
  headerSlot,
  footerError,
  footerNote,
  footerSlot,
  submitDisabled = false,
}: {
  initialValues: CenterDatosValues;
  /** Render the responsable's email field (the login identity). Only true in
   * anonymous registration — the OTP is sent to it. Edit/authed omit it. */
  collectEmail?: boolean;
  submitLabel: string;
  submitPendingLabel: string;
  onSubmit: (
    input: CreateCenterInput,
    values: CenterDatosValues,
  ) => Promise<void>;
  headerSlot?: ReactNode;
  footerError?: string | null;
  footerNote?: ReactNode;
  /** Rendered just above the submit button — used by the wizard to mount the
   * captcha that gates the OTP send (edit reuses this form without it). */
  footerSlot?: ReactNode;
  /** Extra gate on the submit button (besides `pending`) — the wizard uses it
   * to keep "Continuar" disabled until the captcha is solved. */
  submitDisabled?: boolean;
}): ReactElement {
  const [data, setData] = useState<CenterDatosValues>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [emailError, setEmailError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const set = useCallback(
    (key: keyof CenterDatosValues) =>
      (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = e.target.value;
        setData((prev) => ({ ...prev, [key]: value }));
      },
    [],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const found = validateRegistro(toInput(data));
      const emailErr =
        collectEmail && !normalizeEmail(data.email)
          ? "Ingresa un correo electrónico válido."
          : undefined;
      if (Object.keys(found).length > 0 || emailErr) {
        setErrors(found);
        setEmailError(emailErr);
        if (typeof window !== "undefined") window.scrollTo({ top: 0 });
        return;
      }
      setErrors({});
      setEmailError(undefined);
      setPending(true);
      try {
        await onSubmit(toInput(data), data);
      } finally {
        // Re-enable the button even when onSubmit throws (e.g. OTP-send failure
        // keeps the form on screen). A successful submit redirects, so the
        // unmount makes this a no-op in that path.
        setPending(false);
      }
    },
    [data, collectEmail, onSubmit],
  );

  const errorCount = Object.keys(errors).length + (emailError ? 1 : 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col p-4" noValidate>
      {headerSlot}

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

      {CENTER_TYPE_ENABLED && (
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
      )}

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

      <PhoneField
        value={data.nationalPhone}
        onChange={set("nationalPhone")}
        error={errors.whatsappPhone}
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

      <TextField
        id="cargo"
        label="Cargo (opcional)"
        placeholder="Ej: Coordinadora de logística"
        value={data.cargo}
        onChange={set("cargo")}
        error={errors.cargo}
      />

      <TextField
        id="regularScheduleText"
        label="Horario preferido para la entrega (opcional)"
        placeholder="Ej: Lun a Vie, 8am–4pm"
        value={data.regularScheduleText}
        onChange={set("regularScheduleText")}
        error={errors.regularScheduleText}
      />

      {collectEmail && (
        <EmailField
          value={data.email}
          onChange={set("email")}
          error={emailError}
        />
      )}

      {footerError && (
        <p role="alert" className="mt-4 text-sm text-error">
          {footerError}
        </p>
      )}

      {footerSlot}

      <div className="mt-auto flex flex-col items-center gap-3 pt-8">
        {footerNote ? (
          <p className="text-xs text-neutral-500">{footerNote}</p>
        ) : null}
        <Button type="submit" fullWidth disabled={pending || submitDisabled}>
          {pending ? submitPendingLabel : submitLabel}
        </Button>
      </div>
    </form>
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
        className={`mt-2 h-[52px] w-full rounded-md border-[1.5px] bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 ${
          error
            ? "border-error focus:border-2 focus:border-error focus:ring-error/30"
            : "border-neutral-300 focus:border-2 focus:border-accent focus:ring-accent/30"
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
        className={`mt-2 h-[52px] w-full appearance-none rounded-md border-[1.5px] bg-surface bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat px-4 pr-10 text-base outline-none focus:ring-2 ${
          value ? "text-neutral-900" : "text-neutral-400"
        } ${
          error
            ? "border-error focus:border-2 focus:border-error focus:ring-error/30"
            : "border-neutral-300 focus:border-2 focus:border-accent focus:ring-accent/30"
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
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}) {
  return (
    <div className="mt-5">
      <label
        htmlFor="whatsappPhone"
        className="block text-sm font-medium text-neutral-700"
      >
        Teléfono de contacto (WhatsApp) · opcional
      </label>
      <div
        className={`mt-2 flex overflow-hidden rounded-md border-[1.5px] ${
          error
            ? "border-error focus-within:ring-2 focus-within:ring-error/30"
            : "border-neutral-300 focus-within:border-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
        }`}
      >
        <span className="flex items-center border-r border-neutral-300 bg-neutral-50 px-3 text-base font-semibold text-neutral-900">
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
          aria-invalid={error ? true : undefined}
          className="h-[52px] w-full bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-error">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-500">
          Para coordinar la entrega. Puedes dejarlo en blanco.
        </p>
      )}
    </div>
  );
}

function EmailField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}) {
  return (
    <div className="mt-5">
      <label
        htmlFor="email"
        className="block text-sm font-medium text-neutral-700"
      >
        Correo electrónico
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder="tucentro@correo.com"
        value={value}
        onChange={onChange}
        aria-invalid={error ? true : undefined}
        className={`mt-2 h-[52px] w-full rounded-md border-[1.5px] bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 ${
          error
            ? "border-error focus:border-2 focus:border-error focus:ring-error/30"
            : "border-neutral-300 focus:border-2 focus:border-accent focus:ring-accent/30"
        }`}
      />
      {error ? (
        <p className="mt-1.5 text-sm text-error">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-500">
          Con este correo entrarás a tu centro.
        </p>
      )}
    </div>
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
