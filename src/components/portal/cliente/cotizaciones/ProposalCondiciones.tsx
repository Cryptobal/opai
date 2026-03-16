"use client";

import { cn } from "@/lib/utils";
import { formatDate } from "./types";

interface ProposalCondicionesProps {
  validUntil?: string | null;
  paymentTerms?: string;
  serviceStartDays?: number;
  contractDuration?: number;
  sectionNumber: number;
  className?: string;
}

export function ProposalCondiciones({
  validUntil,
  paymentTerms,
  serviceStartDays,
  contractDuration,
  sectionNumber,
  className,
}: ProposalCondicionesProps) {
  const hasAny = validUntil || paymentTerms || serviceStartDays != null || contractDuration != null;
  if (!hasAny) return null;

  return (
    <div className={cn("rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3", className)}>
      <h3 className="text-xl font-bold text-white">
        <span className="text-teal-400">{sectionNumber}.</span> Condiciones Comerciales
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {validUntil && (
          <Card label="Vigencia de la propuesta" value={formatDate(validUntil)} />
        )}
        {paymentTerms && (
          <Card label="Forma de pago" value={paymentTerms.replace(/_/g, " ")} capitalize />
        )}
        {serviceStartDays != null && (
          <Card label="Inicio del servicio" value={`${serviceStartDays} días hábiles`} />
        )}
        {contractDuration != null && (
          <Card label="Duración del contrato" value={`${contractDuration} meses`} />
        )}
      </div>
    </div>
  );
}

function Card({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
      <p className={cn("text-sm text-slate-200 font-medium", capitalize && "capitalize")}>{value}</p>
    </div>
  );
}
