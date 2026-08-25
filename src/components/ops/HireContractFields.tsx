"use client";

import { DatePickerField } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HireContractFields } from "@/lib/personas-lifecycle";

export function HireContractFields({
  value,
  onChange,
  startLabel = "Fecha de inicio",
}: {
  value: HireContractFields;
  onChange: (next: HireContractFields) => void;
  startLabel?: string;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">{startLabel}</Label>
        <DatePickerField
          value={value.startDate || null}
          onChange={(ymd) => onChange({ ...value, startDate: ymd ?? "" })}
          triggerClassName="w-full h-10 sm:h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Tipo de contrato</Label>
        <Select
          value={value.contractType}
          onValueChange={(v) =>
            onChange({
              ...value,
              contractType: v as HireContractFields["contractType"],
              period1End: v === "indefinido" ? "" : value.period1End,
              period2End: v === "indefinido" ? "" : value.period2End,
            })
          }
        >
          <SelectTrigger className="h-10 sm:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="indefinido">Indefinido</SelectItem>
            <SelectItem value="plazo_fijo">Plazo fijo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value.contractType === "plazo_fijo" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha del 1er plazo *</Label>
            <DatePickerField
              value={value.period1End || null}
              onChange={(ymd) => onChange({ ...value, period1End: ymd ?? "" })}
              min={value.startDate || undefined}
              triggerClassName="w-full h-10 sm:h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Fecha del 2do plazo</Label>
            <DatePickerField
              value={value.period2End || null}
              onChange={(ymd) => onChange({ ...value, period2End: ymd ?? "" })}
              min={value.period1End || value.startDate || undefined}
              triggerClassName="w-full h-10 sm:h-9"
            />
            <p className="text-[12px] text-ds-text-3">
              Opcional. Se usa si ya conoces el término de la 1ª renovación.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
