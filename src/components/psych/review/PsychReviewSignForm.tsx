"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

interface Props {
  defaultLicense: string | null;
  onSubmit: (input: {
    reviewerName: string;
    reviewerLicense: string | null;
    reviewNote: string;
  }) => Promise<void>;
}

export default function PsychReviewSignForm({ defaultLicense, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [license, setLicense] = useState(defaultLicense ?? "");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    name.trim().length >= 2 && note.trim().length >= 10 && accepted && !busy;

  async function handle() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        reviewerName: name.trim(),
        reviewerLicense: license.trim() || null,
        reviewNote: note.trim(),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-status-ok-fg dark:text-status-ok-fg" />
        <h3 className="text-lg font-semibold text-foreground">
          Firma profesional
        </h3>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-foreground/90 mb-1 block">
          Nombre completo *
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2.5 text-sm"
          placeholder="María López"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-foreground/90 mb-1 block">
          N° de Colegio de Psicólogos / Licencia
        </span>
        <input
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2.5 text-sm"
          placeholder="Ej: CP-00123"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-foreground/90 mb-1 block">
          Observaciones profesionales *
        </span>
        <textarea
          rows={5}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm"
          placeholder="Tu análisis y recomendaciones sobre este informe…"
        />
        <span className="text-xs text-muted-foreground">
          Mínimo 10 caracteres · {note.trim().length}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground/90">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Firmo este informe en calidad de psicólogo/a profesional acreditado/a
          y confirmo que las observaciones son de mi autoría.
        </span>
      </label>
      {err ? (
        <p className="text-sm text-status-danger-fg dark:text-status-danger-fg">{err}</p>
      ) : null}
      <button
        onClick={handle}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-3 font-medium min-h-[48px]"
      >
        {busy ? "Firmando…" : "Firmar y enviar"}
      </button>
    </div>
  );
}
