"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacturaTimingValue } from "./factura-timing-preview";

interface Props {
  value: FacturaTimingValue;
  onChange: (next: FacturaTimingValue) => void;
}

/** Subcampos de DIA_ESPECIFICO: qué día sale la factura y de qué mes. */
export function FacturaTimingFields({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="t-factura-day">Día de emisión de la factura *</Label>
        <Input
          id="t-factura-day"
          type="number"
          min={-1}
          max={31}
          inputMode="numeric"
          value={value.facturaDay}
          onChange={(e) => onChange({ ...value, facturaDay: e.target.value })}
          placeholder="1, 15, -1 (último)"
          className="h-10 sm:h-9 bg-background"
          autoComplete="off"
        />
        <p className="text-[12px] text-muted-foreground">
          Usá -1 para &quot;último día del mes&quot;.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>¿En qué mes?</Label>
        <Select
          value={value.facturaMesRelativo}
          onValueChange={(v) =>
            onChange({
              ...value,
              facturaMesRelativo: v as FacturaTimingValue["facturaMesRelativo"],
            })
          }
        >
          <SelectTrigger className="h-10 sm:h-9 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MES_SIGUIENTE">
              Mes siguiente a la programación
            </SelectItem>
            <SelectItem value="MISMO_MES">Mismo mes</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
