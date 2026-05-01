"use client";

import { CheckCircle2, Edit3, X } from "lucide-react";
import type { SelectedPerson } from "./PersonSelector";

export interface ManualForm {
  targetName: string;
  targetRut: string;
  targetEmail: string;
  targetPhone: string;
}

export function SelectedPersonCard({
  person,
  onClear,
}: {
  person: SelectedPerson;
  onClear: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <CheckCircle2 className="size-5 text-status-ok-fg dark:text-status-ok-fg shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {person.displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {person.subtitle}
            {person.rut ? ` · ${person.rut}` : ""}
          </p>
          {person.email || person.phone ? (
            <p className="text-xs text-muted-foreground mt-1">
              {[person.email, person.phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Cambiar persona"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

const MANUAL_FIELDS = [
  { k: "targetName", label: "Nombre del candidato *", ph: "Juan Pérez" },
  { k: "targetRut", label: "RUT", ph: "12.345.678-9" },
  { k: "targetEmail", label: "Email", ph: "juan@example.cl" },
  { k: "targetPhone", label: "Teléfono (WhatsApp)", ph: "+56 9 1234 5678" },
] as const;

export function ManualInputs({
  form,
  onChange,
  onCancel,
}: {
  form: ManualForm;
  onChange: <K extends keyof ManualForm>(k: K, v: ManualForm[K]) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Ingreso manual
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground underline"
        >
          ← Volver al buscador
        </button>
      </div>
      {MANUAL_FIELDS.map((f) => (
        <label key={f.k} className="block">
          <span className="text-sm font-medium text-foreground/90 mb-1 block">
            {f.label}
          </span>
          <input
            type={f.k === "targetEmail" ? "email" : "text"}
            value={form[f.k]}
            onChange={(e) => onChange(f.k, e.target.value)}
            placeholder={f.ph}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground"
          />
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        <Edit3 className="inline size-3 mr-1" />
        Después de crear, podrás editar los datos del postulante en el sistema
        ATS.
      </p>
    </div>
  );
}
