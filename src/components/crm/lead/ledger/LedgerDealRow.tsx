"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCLP } from "@/lib/utils";
import { LedgerRow } from "./LedgerRow";

export interface LedgerDealFields {
  dealTitle: string;
  notes: string;
}

export interface LedgerDealRowProps {
  approveForm: LedgerDealFields;
  updateApproveForm: (field: string, value: string) => void;
  inputClassName: string;
  /** Suma mensual estimada de todas las instalaciones (CLP). */
  estimatedSaleClp: number | null;
  defaultOpen?: boolean;
}

export function LedgerDealRow({
  approveForm,
  updateApproveForm,
  inputClassName,
  estimatedSaleClp,
  defaultOpen,
}: LedgerDealRowProps) {
  const meta =
    estimatedSaleClp != null && estimatedSaleClp > 0
      ? `Etapa: Nuevo · est. ${formatCLP(estimatedSaleClp)}/mes`
      : "Etapa: Nuevo";

  return (
    <LedgerRow
      id="ledger-deal"
      type="Negocio"
      name={approveForm.dealTitle || "Sin título"}
      meta={meta}
      created
      defaultOpen={defaultOpen}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Título del negocio</Label>
          <Input value={approveForm.dealTitle} onChange={(e) => updateApproveForm("dealTitle", e.target.value)} placeholder="Oportunidad para..." className={inputClassName} />
        </div>
        <div className="space-y-1.5">
          <Label>Solicitud</Label>
          <textarea
            value={approveForm.notes}
            onChange={(e) => updateApproveForm("notes", e.target.value)}
            placeholder="Descripción de la solicitud (se copiará al negocio y cotización)..."
            className={`min-h-[120px] w-full resize-y rounded-md border px-3 py-2 text-sm ${inputClassName}`}
            rows={5}
          />
          <p className="text-xs text-muted-foreground">Esta solicitud se agregará al negocio y a las cotizaciones creadas.</p>
        </div>
      </div>
    </LedgerRow>
  );
}
