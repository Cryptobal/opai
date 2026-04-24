"use client";

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import PsychSendToPsychologistForm from "./PsychSendToPsychologistForm";

interface Props {
  assessmentId: string;
  onClose: () => void;
}

export default function PsychSendToPsychologistDialog({
  assessmentId,
  onClose,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );

  const canSubmit =
    email.includes("@") && name.trim().length >= 2 && !busy;

  async function handle() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/psych/assessments/${assessmentId}/send-to-psychologist`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reviewerEmail: email.trim(),
            reviewerName: name.trim(),
            reviewerLicense: license.trim() || null,
          }),
        },
      );
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Error");
      setDone({ url: j.reviewUrl, expiresAt: j.expiresAt });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-md w-full shadow-xl space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Enviar a psicólogo
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              ✓ Email enviado a {email}
            </p>
            <div className="rounded-lg border border-border bg-muted/40 p-2 text-[10px] break-all font-mono">
              {done.url}
            </div>
            <p className="text-xs text-muted-foreground">
              El enlace expira el{" "}
              {new Date(done.expiresAt).toLocaleDateString("es-CL")}.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 min-h-[44px]"
            >
              Listo
            </button>
          </div>
        ) : (
          <PsychSendToPsychologistForm
            email={email}
            setEmail={setEmail}
            name={name}
            setName={setName}
            license={license}
            setLicense={setLicense}
            busy={busy}
            err={err}
            canSubmit={canSubmit}
            onCancel={onClose}
            onSubmit={handle}
          />
        )}
      </div>
    </div>
  );
}
