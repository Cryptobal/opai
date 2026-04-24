"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PsychShareLinkModal from "./PsychShareLinkModal";
import PersonSelector, { type SelectedPerson } from "./PersonSelector";
import {
  SelectedPersonCard,
  ManualInputs,
  type ManualForm,
} from "./PsychCreateFormParts";

const EMPTY_MANUAL: ManualForm = {
  targetName: "",
  targetRut: "",
  targetEmail: "",
  targetPhone: "",
};

export default function PsychCreateForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedPerson | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState<ManualForm>(EMPTY_MANUAL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    assessmentId: string;
    url: string;
    expiresAt: string;
  } | null>(null);

  const displayName = selected?.displayName ?? manual.targetName;
  const displayPhone = selected?.phone ?? manual.targetPhone;
  const displayEmail = selected?.email ?? manual.targetEmail;

  async function handleSubmit() {
    setBusy(true);
    setErr(null);
    try {
      const body = selected
        ? {
            targetName: selected.displayName,
            personaId: selected.id,
            targetRut: selected.rut,
            targetEmail: selected.email,
            targetPhone: selected.phone,
          }
        : {
            targetName: manual.targetName.trim(),
            targetRut: manual.targetRut.trim() || null,
            targetEmail: manual.targetEmail.trim() || null,
            targetPhone: manual.targetPhone.trim() || null,
          };
      const res = await fetch("/api/psych/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error");
      setResult({
        assessmentId: json.assessmentId,
        url: json.url,
        expiresAt: json.expiresAt,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = selected
    ? true
    : manual.targetName.trim().length >= 2;

  return (
    <>
      <div className="max-w-2xl space-y-4 bg-card p-5 md:p-6 rounded-xl border border-border">
        {!selected && !manualMode ? (
          <>
            <label className="block text-sm font-medium text-foreground/90 mb-1">
              Postulante o guardia
            </label>
            <PersonSelector onSelect={setSelected} />
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="text-xs text-muted-foreground underline"
            >
              ¿No está en el sistema? Ingresar datos manualmente
            </button>
          </>
        ) : selected ? (
          <SelectedPersonCard person={selected} onClear={() => setSelected(null)} />
        ) : (
          <ManualInputs
            form={manual}
            onChange={(k, v) => setManual((f) => ({ ...f, [k]: v }))}
            onCancel={() => setManualMode(false)}
          />
        )}
        {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-border px-4 py-2 text-foreground/90 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !canSubmit}
            className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 disabled:opacity-50 min-h-[44px] flex-1"
          >
            {busy ? "Creando..." : "Generar enlace"}
          </button>
        </div>
      </div>
      {result ? (
        <PsychShareLinkModal
          assessmentId={result.assessmentId}
          url={result.url}
          expiresAt={result.expiresAt}
          candidateName={displayName}
          phone={displayPhone || null}
          email={displayEmail || null}
          onClose={() => {
            setResult(null);
            router.push("/personas/psicolaboral");
          }}
        />
      ) : null}
    </>
  );
}

