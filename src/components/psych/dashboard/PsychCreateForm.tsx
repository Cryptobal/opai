"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PsychShareLinkModal from "./PsychShareLinkModal";

export default function PsychCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    targetName: "",
    targetRut: "",
    targetEmail: "",
    targetPhone: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);

  function handleChange(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = {
        targetName: form.targetName.trim(),
        targetRut: form.targetRut.trim() || null,
        targetEmail: form.targetEmail.trim() || null,
        targetPhone: form.targetPhone.trim() || null,
      };
      const res = await fetch("/api/psych/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo crear");
      }
      setResult({ url: json.url, expiresAt: json.expiresAt });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 bg-white p-6 rounded-xl border border-slate-200">
        <Field label="Nombre del candidato *" required>
          <input required value={form.targetName} onChange={(e) => handleChange("targetName", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </Field>
        <Field label="RUT">
          <input value={form.targetRut} onChange={(e) => handleChange("targetRut", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="12.345.678-9" />
        </Field>
        <Field label="Email">
          <input type="email" value={form.targetEmail} onChange={(e) => handleChange("targetEmail", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </Field>
        <Field label="Teléfono (WhatsApp)">
          <input value={form.targetPhone} onChange={(e) => handleChange("targetPhone", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="+56 9 1234 5678" />
        </Field>
        {err ? <p className="text-sm text-rose-700">{err}</p> : null}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700">
            Cancelar
          </button>
          <button type="submit" disabled={busy || !form.targetName.trim()} className="rounded-lg bg-slate-900 text-white px-4 py-2 disabled:opacity-50">
            {busy ? "Creando..." : "Generar enlace"}
          </button>
        </div>
      </form>
      {result ? (
        <PsychShareLinkModal
          url={result.url}
          expiresAt={result.expiresAt}
          candidateName={form.targetName}
          phone={form.targetPhone || null}
          onClose={() => {
            setResult(null);
            router.push("/personas/psicolaboral");
          }}
        />
      ) : null}
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 mb-1 block">
        {label}
        {required ? " " : null}
      </span>
      {children}
    </label>
  );
}
