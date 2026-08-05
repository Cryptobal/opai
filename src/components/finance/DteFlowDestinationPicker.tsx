"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FlowDestination = "OWN_ROW" | "OTHER_INCOME" | "EXCLUDE";

const OPTIONS: {
  value: FlowDestination;
  label: string;
  help: string;
  requiresCashflowManage?: boolean;
}[] = [
  {
    value: "OWN_ROW",
    label: "Fila propia del cliente",
    help: "Crea o conserva una fila de este cliente en Ingresos.",
  },
  {
    value: "OTHER_INCOME",
    label: "Otros ingresos",
    help: "Suma en la fila canónica sin crear fila nueva.",
  },
  {
    value: "EXCLUDE",
    label: "No incluir en el flujo",
    help: "Queda fuera de la planilla (restaurable con el motivo).",
    requiresCashflowManage: true,
  },
];

export function DteFlowDestinationPicker({
  value,
  reason,
  canManageCashflow,
  highlight,
  onChange,
  onReasonChange,
}: {
  value: FlowDestination | null;
  reason: string;
  canManageCashflow: boolean;
  /** Resaltar el bloque tras intento de emitir sin elección. */
  highlight?: boolean;
  onChange: (v: FlowDestination) => void;
  onReasonChange: (v: string) => void;
}) {
  const visible = OPTIONS.filter(
    (o) => !o.requiresCashflowManage || canManageCashflow,
  );

  return (
    <div
      id="dte-flow-destination"
      className={`space-y-3 md:col-span-2 rounded-lg ${
        highlight
          ? "ring-2 ring-status-warn-border bg-status-warn-soft/40 p-3"
          : ""
      }`}
    >
      <div className="space-y-1.5">
        <Label>Destino en flujo de caja *</Label>
        <div className="flex flex-wrap gap-2">
          {visible.map((o) => (
            <Button
              key={o.value}
              type="button"
              variant={value === o.value ? "default" : "outline"}
              size="sm"
              className="h-11 sm:h-9 min-w-[140px]"
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-ds-text-3">
          {value
            ? (OPTIONS.find((o) => o.value === value)?.help ?? "")
            : "Elegí dónde entra esta factura en el flujo de caja."}
        </p>
      </div>
      {value === "EXCLUDE" && (
        <div className="space-y-1.5 max-w-md">
          <Label htmlFor="dte-flow-exclusion-reason">Motivo *</Label>
          <Input
            id="dte-flow-exclusion-reason"
            className="h-10 sm:h-9"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Factura puntual fuera del flujo de caja"
            maxLength={300}
          />
          <p className="text-xs text-ds-text-3">
            Mínimo 5 caracteres. Quedará listada en excluidos y podés restaurarla.
          </p>
        </div>
      )}
    </div>
  );
}
