"use client";

import { useState } from "react";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import PersonalPsychPanel from "@/components/psych/integrations/PersonalPsychPanel";
import PsychShareLinkModal from "@/components/psych/dashboard/PsychShareLinkModal";

interface Props {
  guardiaId: string;
  personaId: string;
  guardName: string;
  email: string | null;
  phone: string | null;
}

export default function GuardiaPsicolaboralSection({
  personaId,
  guardName,
  email,
  phone,
}: Props) {
  const { isModuleEnabled } = useTenantModules();
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<{
    assessmentId: string;
    url: string;
    expiresAt: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!isModuleEnabled("psych")) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-3">
        <h3 className="text-lg font-medium text-foreground">
          Módulo Psicolaboral
        </h3>
        <p className="text-sm text-muted-foreground">
          No está habilitado en tu plan.
        </p>
        <a
          href="/opai/modulos"
          className="inline-block rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm min-h-[44px]"
        >
          Activar módulo
        </a>
      </div>
    );
  }

  async function handleCreate() {
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/psych/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, targetName: guardName }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Error");
      setModal({
        assessmentId: j.assessmentId,
        url: j.url,
        expiresAt: j.expiresAt,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Evaluación psicolaboral
          </h3>
          <p className="text-xs text-muted-foreground">
            Screening interno de aptitud · complemento al OS-10
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 px-4 py-2 text-sm min-h-[44px]"
        >
          {creating ? "Creando…" : "+ Nueva evaluación"}
        </button>
      </div>
      {err ? (
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      ) : null}
      <PersonalPsychPanel personaId={personaId} guardName={guardName} />
      {modal ? (
        <PsychShareLinkModal
          assessmentId={modal.assessmentId}
          url={modal.url}
          expiresAt={modal.expiresAt}
          candidateName={guardName}
          phone={phone}
          email={email}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}
