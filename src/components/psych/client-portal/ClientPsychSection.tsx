"use client";

import { useEffect, useState } from "react";
import ClientPsychOverviewCard from "./ClientPsychOverviewCard";
import ClientPsychGuardsList from "./ClientPsychGuardsList";
import ClientPsychSummaryPanel from "./ClientPsychSummaryPanel";

interface Contract {
  contractId: string;
  reportLevel: "SEAL" | "SUMMARY" | "FULL";
  degradedFromFull: boolean;
  coverage: {
    totalGuards: number;
    evaluatedGuards: number;
    validAssessments: number;
  };
  assignedGuards: Array<{
    personaId: string | null;
    name: string;
    evaluatedAt: string | null;
    validUntil: string | null;
    isValid: boolean;
  }>;
  distribution?: {
    fit: number;
    caution: number;
    notRecommended: number;
    none: number;
  };
}

export default function ClientPsychSection() {
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client-portal/psych/overview")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setContracts(j.contracts);
        else setErr(j.error ?? "Error");
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) {
    return <p className="text-sm text-rose-700">No se pudo cargar: {err}</p>;
  }
  if (!contracts) return <p className="text-sm text-slate-500">Cargando…</p>;

  if (contracts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
        No hay contratos con módulo psicolaboral habilitado.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {contracts.map((c) => (
        <section key={c.contractId} className="space-y-3">
          <ClientPsychOverviewCard
            contractName={`Contrato ${c.contractId.slice(0, 8)}`}
            totalGuards={c.coverage.totalGuards}
            evaluatedGuards={c.coverage.evaluatedGuards}
            validAssessments={c.coverage.validAssessments}
            reportLevel={c.reportLevel}
            degradedFromFull={c.degradedFromFull}
          />
          {c.distribution ? (
            <ClientPsychSummaryPanel distribution={c.distribution} />
          ) : null}
          <ClientPsychGuardsList
            guards={c.assignedGuards}
            showEvaluationDate={true}
          />
        </section>
      ))}
    </div>
  );
}
