"use client";

import { DatePickerField } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

type Deal = CrmStructureProposal["deal"];

type Props = {
  deal: Deal;
  onChange: (field: keyof Deal, value: unknown) => void;
};

export function PlanDealForm({ deal, onChange }: Props) {
  return (
    <div className="space-y-3">
      <FormField
        id="deal-title"
        label="Título del negocio"
        value={deal.title ?? ""}
        onChange={(v) => onChange("title", v || null)}
      />
      <div className="flex items-center gap-3">
        <Checkbox
          id="deal-licitacion"
          checked={deal.isLicitacion}
          onCheckedChange={(v) => onChange("isLicitacion", Boolean(v))}
          className="h-5 w-5"
        />
        <Label htmlFor="deal-licitacion" className="cursor-pointer text-[13px] text-ds-text-2">
          Licitación / RFI
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField
          id="deal-meses"
          label="Meses de contrato"
          type="number"
          value={deal.mesesContrato != null ? String(deal.mesesContrato) : ""}
          onChange={(v) => onChange("mesesContrato", v ? Number(v) : null)}
        />
        <div className="space-y-1">
          <Label htmlFor="deal-fecha" className="text-[12px] text-ds-text-3">
            Fecha límite
          </Label>
          <DatePickerField
            id="deal-fecha"
            value={deal.fechaLimite ?? null}
            onChange={(ymd) => onChange("fechaLimite", ymd)}
            aria-label="Fecha límite"
            clearable
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="deal-notes" className="text-[12px] text-ds-text-3">
          Notas
        </Label>
        <Textarea
          id="deal-notes"
          rows={3}
          value={deal.notes ?? ""}
          onChange={(e) => onChange("notes", e.target.value || null)}
          className="min-h-[72px] resize-y text-[13px]"
        />
      </div>
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-[13px] sm:h-9"
      />
    </div>
  );
}
