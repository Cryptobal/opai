"use client";

import { Mail } from "lucide-react";

interface Props {
  email: string;
  setEmail: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  license: string;
  setLicense: (v: string) => void;
  busy: boolean;
  err: string | null;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function PsychSendToPsychologistForm(p: Props) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        El psicólogo recibirá un email con un link para revisar y firmar el
        informe. El enlace expira en 72 horas.
      </p>
      <Field label="Email del psicólogo *">
        <input
          type="email"
          value={p.email}
          onChange={(e) => p.setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2.5 text-sm"
          placeholder="psicologo@ejemplo.cl"
        />
      </Field>
      <Field label="Nombre *">
        <input
          value={p.name}
          onChange={(e) => p.setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2.5 text-sm"
          placeholder="María López"
        />
      </Field>
      <Field label="N° de licencia (opcional)">
        <input
          value={p.license}
          onChange={(e) => p.setLicense(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2.5 text-sm"
          placeholder="CP-00123"
        />
      </Field>
      {p.err ? (
        <p className="text-sm text-status-danger-fg dark:text-status-danger-fg">{p.err}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={p.onCancel}
          className="flex-1 rounded-lg border border-border px-4 py-2 text-foreground/90 min-h-[44px]"
        >
          Cancelar
        </button>
        <button
          onClick={p.onSubmit}
          disabled={!p.canSubmit}
          className="flex-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2 min-h-[44px] flex items-center justify-center gap-2"
        >
          <Mail className="size-4" />
          {p.busy ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground/90 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
