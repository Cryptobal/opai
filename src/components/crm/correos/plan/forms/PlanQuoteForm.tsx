"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlanQuoteInput } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  quoteInput: PlanQuoteInput;
  onChange: (partial: Partial<PlanQuoteInput>) => void;
};

export function PlanQuoteForm({ quoteInput, onChange }: Props) {
  return (
    <div className="space-y-3">
      <FormField
        id="q-name"
        label="Nombre de la cotización"
        value={quoteInput.name}
        onChange={(v) => onChange({ name: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="q-currency" className="text-[12px] text-ds-text-3">
            Moneda
          </Label>
          <Select
            value={quoteInput.currency}
            onValueChange={(v) => onChange({ currency: v })}
          >
            <SelectTrigger id="q-currency" className="h-10 text-[13px] sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CLP">CLP</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="UF">UF</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <FormField
          id="q-duration"
          label="Duración (meses)"
          type="number"
          value={String(quoteInput.contractDuration)}
          onChange={(v) => onChange({ contractDuration: v ? Number(v) : 12 })}
        />
      </div>
      <FormField
        id="q-valid"
        label="Válida hasta"
        type="date"
        value={quoteInput.validUntil ?? ""}
        onChange={(v) => onChange({ validUntil: v || null })}
      />
      <div className="flex items-center gap-3">
        <Checkbox
          id="q-ongoing"
          checked={quoteInput.isOngoingService}
          onCheckedChange={(v) => onChange({ isOngoingService: Boolean(v) })}
          className="h-5 w-5"
        />
        <Label htmlFor="q-ongoing" className="cursor-pointer text-[13px] text-ds-text-2">
          Servicio continuo (no por obra)
        </Label>
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
