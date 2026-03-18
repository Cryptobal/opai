"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CommercialConditionsData {
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  proposalTemplateId: string | null;
}

interface CommercialConditionsSectionProps {
  value: CommercialConditionsData;
  onChange: (data: CommercialConditionsData) => void;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  isLocked?: boolean;
}

export function CommercialConditionsSection({
  value,
  onChange,
  proposalTemplates = [],
  isLocked,
}: CommercialConditionsSectionProps) {
  const update = (patch: Partial<CommercialConditionsData>) => onChange({ ...value, ...patch });

  const filteredTemplates = proposalTemplates.filter(
    (t) =>
      !((t.name || "").toLowerCase().includes("presentación") &&
        (t.name || "").toLowerCase().includes("empresa"))
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Forma de pago</Label>
        <select
          value={value.paymentTerms}
          onChange={(e) => update({ paymentTerms: e.target.value })}
          disabled={isLocked}
          className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="contrafactura">Contrafactura</option>
          <option value="30_dias">30 días</option>
          <option value="anticipado">Pago anticipado</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Inicio servicios</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={90}
            value={value.serviceStartDays}
            onChange={(e) => update({ serviceStartDays: Number(e.target.value) || 5 })}
            disabled={isLocked}
            className="h-8 bg-card text-foreground border-border text-xs w-16"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">días háb.</span>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Duración contrato</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={60}
            value={value.contractDuration}
            onChange={(e) => update({ contractDuration: Number(e.target.value) || 12 })}
            disabled={isLocked}
            className="h-8 bg-card text-foreground border-border text-xs w-16"
          />
          <span className="text-[10px] text-muted-foreground">meses</span>
        </div>
      </div>
      {filteredTemplates.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Propuesta económica</Label>
          <select
            value={value.proposalTemplateId ?? ""}
            onChange={(e) => update({ proposalTemplateId: e.target.value || null })}
            disabled={isLocked}
            className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {filteredTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
