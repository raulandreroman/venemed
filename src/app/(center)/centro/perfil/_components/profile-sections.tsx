"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import {
  updateCenterDetails,
  updateResponsable,
} from "@/app/(center)/actions/editar";
import { CENTER_TYPE_ENABLED } from "@/lib/flags";
import { centerTypeLabel, formatVePhone } from "@/lib/format";
import {
  CENTER_TYPE_OPTIONS,
  VE_STATES,
  normalizeVePhone,
  validateCenterDetails,
  validateResponsable,
  type CenterDetailsInput,
  type CenterType,
  type FieldErrors,
  type ResponsableInput,
} from "@/lib/registro/validation";

/** The update actions can redirect (anon / no-membership) → the thrown
 * NEXT_REDIRECT must be re-thrown so Next navigates. */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const SAVE_ERROR = "No pudimos guardar los cambios. Inténtalo de nuevo.";

// ===== Información del centro =================================================

export type CenterDetailsValues = {
  name: string;
  type: CenterType | "";
  state: string;
  city: string;
  addressLine: string;
  addressReference: string;
  regularScheduleText: string;
};

export function CenterDetailsSection({
  initial,
  readOnly = false,
}: {
  initial: CenterDetailsValues;
  /** Operador view: read-only, no "Editar datos del centro" action. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = useCallback(
    (k: keyof CenterDetailsValues) => (v: string) =>
      setValues((p) => ({ ...p, [k]: v })),
    [],
  );

  const cancel = useCallback(() => {
    setValues(initial);
    setErrors({});
    setSubmitError(null);
    setEditing(false);
  }, [initial]);

  const save = useCallback(async () => {
    const input: CenterDetailsInput = {
      name: values.name,
      type: CENTER_TYPE_ENABLED ? values.type || null : null,
      state: values.state,
      city: values.city,
      addressLine: values.addressLine,
      addressReference: values.addressReference || undefined,
      regularScheduleText: values.regularScheduleText || undefined,
    };
    const errs = validateCenterDetails(input);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setPending(true);
    try {
      await updateCenterDetails(input);
      setPending(false);
      setEditing(false);
      router.refresh();
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setPending(false);
      setSubmitError(SAVE_ERROR);
    }
  }, [values, router]);

  if (!editing) {
    return (
      <Section
        title="Información del centro"
        action={
          readOnly ? undefined : (
            <EditButton
              label="Editar datos del centro"
              onClick={() => setEditing(true)}
            />
          )
        }
      >
        <ReadRow label="Nombre legal" value={values.name} />
        {CENTER_TYPE_ENABLED && values.type && (
          <ReadRow label="Tipo" value={centerTypeLabel(values.type)} />
        )}
        <ReadRow label="Ciudad" value={cityLine(values.city, values.state)} />
        <ReadRow
          label="Dirección"
          value={values.addressLine || "No especificada"}
        />
      </Section>
    );
  }

  return (
    <Section title="Información del centro">
      <Field
        label="Nombre legal"
        value={values.name}
        onChange={set("name")}
        error={errors.name}
      />
      {CENTER_TYPE_ENABLED && (
        <SelectField
          label="Tipo de centro"
          value={values.type}
          onChange={set("type")}
          options={CENTER_TYPE_OPTIONS}
          placeholder="Selecciona el tipo"
          error={errors.type}
        />
      )}
      <SelectField
        label="Estado"
        value={values.state}
        onChange={set("state")}
        options={VE_STATES.map((s) => ({ value: s, label: s }))}
        placeholder="Selecciona el estado"
        error={errors.state}
      />
      <Field
        label="Ciudad"
        value={values.city}
        onChange={set("city")}
        error={errors.city}
      />
      <Field
        label="Dirección"
        value={values.addressLine}
        onChange={set("addressLine")}
        error={errors.addressLine}
      />
      <Field
        label="Referencia (opcional)"
        value={values.addressReference}
        onChange={set("addressReference")}
        error={errors.addressReference}
      />
      <Field
        label="Horario de atención (opcional)"
        value={values.regularScheduleText}
        onChange={set("regularScheduleText")}
        error={errors.regularScheduleText}
      />
      <EditFooter pending={pending} error={submitError} onCancel={cancel} onSave={save} />
    </Section>
  );
}

// ===== Persona responsable ===================================================

export type ResponsableValues = {
  responsibleName: string;
  cargo: string;
  /** read-only — the verified login identity (email). */
  email: string;
  /** Optional WhatsApp contact — NATIONAL digits (e.g. "4125550034"); "" when unset. */
  whatsappPhone: string;
};

export function ResponsableSection({
  initial,
  readOnly = false,
}: {
  initial: ResponsableValues;
  /** Operador view: read-only, no "Cambiar responsable" action. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = useCallback(
    (k: "responsibleName" | "cargo" | "whatsappPhone") => (v: string) =>
      setValues((p) => ({ ...p, [k]: v })),
    [],
  );

  const cancel = useCallback(() => {
    setValues(initial);
    setErrors({});
    setSubmitError(null);
    setEditing(false);
  }, [initial]);

  const save = useCallback(async () => {
    const rawPhone = values.whatsappPhone.trim();
    const input: ResponsableInput = {
      responsibleName: values.responsibleName,
      cargo: values.cargo || undefined,
      // Invalid values pass through raw so the validator flags them (same
      // contract as the registro form's toInput).
      whatsappPhone: rawPhone
        ? (normalizeVePhone(rawPhone) ?? rawPhone)
        : undefined,
    };
    const errs = validateResponsable(input);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setPending(true);
    try {
      await updateResponsable(input);
      setPending(false);
      setEditing(false);
      router.refresh();
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setPending(false);
      setSubmitError(SAVE_ERROR);
    }
  }, [values, router]);

  if (!editing) {
    return (
      <Section
        title="Persona responsable"
        action={
          readOnly ? undefined : (
            <EditButton
              label="Cambiar responsable"
              onClick={() => setEditing(true)}
            />
          )
        }
      >
        <ReadRow
          label="Nombre"
          value={values.responsibleName || "No especificado"}
        />
        {values.cargo && <ReadRow label="Cargo" value={values.cargo} />}
        <ReadRow label="Correo de acceso" value={values.email} />
        <ReadRow
          label="Teléfono de contacto (WhatsApp)"
          value={
            values.whatsappPhone
              ? formatVePhone(normalizeVePhone(values.whatsappPhone) ?? values.whatsappPhone)
              : "No especificado"
          }
        />
      </Section>
    );
  }

  return (
    <Section title="Persona responsable">
      <Field
        label="Nombre y apellido"
        value={values.responsibleName}
        onChange={set("responsibleName")}
        error={errors.responsibleName}
      />
      <Field
        label="Cargo (opcional)"
        value={values.cargo}
        onChange={set("cargo")}
        error={errors.cargo}
      />
      {/* Email is the verified login identity — not editable here. */}
      <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-3">
        <span className="text-xs text-neutral-500">Correo de acceso</span>
        <span className="text-base text-neutral-400">{values.email}</span>
        <span className="text-xs text-neutral-400">
          Tu correo de acceso no se puede cambiar aquí.
        </span>
      </div>
      <div className="flex flex-col gap-1.5 py-3">
        <label
          htmlFor="perfil-whatsapp"
          className="text-xs text-neutral-500"
        >
          Teléfono de contacto (WhatsApp) · opcional
        </label>
        <div
          className={`flex overflow-hidden rounded-md border-[1.5px] ${
            errors.whatsappPhone
              ? "border-error"
              : "border-neutral-300 focus-within:border-accent"
          }`}
        >
          <span className="flex items-center border-r border-neutral-300 bg-neutral-50 px-3 text-base font-semibold text-neutral-900">
            +58
          </span>
          <input
            id="perfil-whatsapp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="412 000 0000"
            value={values.whatsappPhone}
            onChange={(e) => set("whatsappPhone")(e.target.value)}
            aria-invalid={errors.whatsappPhone ? true : undefined}
            className="h-12 w-full bg-surface px-3 text-base text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>
        {errors.whatsappPhone && (
          <p className="text-sm text-error">{errors.whatsappPhone}</p>
        )}
      </div>
      <EditFooter pending={pending} error={submitError} onCancel={cancel} onSave={save} />
    </Section>
  );
}

// ===== shared bits ===========================================================

function cityLine(city: string, state: string): string {
  return [city, state].filter(Boolean).join(" · ");
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-500">{title}</h2>
        {action}
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-semibold text-accent"
    >
      {label}
    </button>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-3 last:border-b-0">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-base text-neutral-900">{value}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 py-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-[52px] w-full rounded-md border-[1.5px] bg-surface px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-accent/30 ${
          error ? "border-error" : "border-neutral-300 focus:border-2 focus:border-accent"
        }`}
      />
      {error && <span className="text-xs text-error">{error}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 py-2">
      <span className="text-xs text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-[52px] w-full rounded-md border-[1.5px] bg-surface px-4 text-base outline-none focus:ring-2 focus:ring-accent/30 ${
          value ? "text-neutral-900" : "text-neutral-400"
        } ${error ? "border-error" : "border-neutral-300 focus:border-2 focus:border-accent"}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-error">{error}</span>}
    </label>
  );
}

function EditFooter({
  pending,
  error,
  onCancel,
  onSave,
}: {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          fullWidth
          disabled={pending}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="button" fullWidth disabled={pending} onClick={onSave}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </>
  );
}
