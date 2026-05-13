"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Pencil,
  CircleSlash,
  Trash2,
  Move,
} from "lucide-react";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmt } from "./MatrixHelpers";

const MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function bucketChipLabel(
  b: ProjectionBucket,
  granularity: "weekly" | "monthly",
) {
  if (granularity === "monthly") {
    return `${MONTH_SHORT[b.start.getMonth()]} '${String(b.start.getFullYear()).slice(-2)}`;
  }
  return b.label;
}

export type DrawerMode =
  | "idle"
  | "moving"
  | "editingAmount"
  | "confirmingCancel"
  | "confirmingEnd";

export type DrawerBusy =
  | null
  | "move"
  | "amount"
  | "cancel"
  | "end";

interface Props {
  mode: DrawerMode;
  busy: DrawerBusy;
  granularity: "weekly" | "monthly";
  otherBuckets: ProjectionBucket[];
  draftAmount: string;
  currentAmount: number;
  onDraftAmountChange: (next: string) => void;
  onStartMove: () => void;
  onStartEdit: () => void;
  onStartCancel: () => void;
  onStartEnd: () => void;
  onCancelMode: () => void;
  onMoveTo: (b: ProjectionBucket) => void;
  onSaveAmount: () => void;
  onConfirmCancel: () => void;
  onConfirmEnd: () => void;
}

export function CashflowItemDrawerActions(props: Props) {
  const {
    mode,
    busy,
    granularity,
    otherBuckets,
    draftAmount,
    currentAmount,
    onDraftAmountChange,
    onStartMove,
    onStartEdit,
    onStartCancel,
    onStartEnd,
    onCancelMode,
    onMoveTo,
    onSaveAmount,
    onConfirmCancel,
    onConfirmEnd,
  } = props;

  if (mode === "moving") {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-ds-text-3">Elegí el período destino:</p>
        <div className="flex flex-wrap gap-1.5 max-h-[40vh] overflow-y-auto">
          {otherBuckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => onMoveTo(b)}
              disabled={busy !== null}
              className="h-9 px-3 rounded-ds-md text-[12px] font-medium bg-muted/30 text-ds-text-2 hover:bg-muted/60 disabled:opacity-50"
            >
              {bucketChipLabel(b, granularity)}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={onCancelMode}
          disabled={busy !== null}
          className="w-full h-11 text-[13px]"
        >
          Cancelar
        </Button>
        {busy === "move" && (
          <p className="flex items-center justify-center gap-2 text-[13px] text-ds-text-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Moviendo…
          </p>
        )}
      </div>
    );
  }

  if (mode === "editingAmount") {
    return (
      <div className="space-y-2">
        <label className="text-[12px] text-ds-text-3 block">
          Nuevo monto (CLP)
        </label>
        <Input
          autoFocus
          inputMode="decimal"
          value={draftAmount}
          onChange={(e) => {
            const cleaned = e.target.value
              .replace(/[^\d,.-]/g, "")
              .replace(/\./g, "")
              .replace(",", ".");
            const n = Number(cleaned);
            onDraftAmountChange(
              Number.isFinite(n) ? fmt.format(n) : e.target.value,
            );
          }}
          className="h-12 font-mono text-right text-[16px] font-semibold"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancelMode}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px]"
          >
            Cancelar
          </Button>
          <Button
            onClick={onSaveAmount}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px]"
          >
            {busy === "amount" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "confirmingCancel") {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-ds-text-2">
          Esta cuota dejará de proyectarse. Las próximas cuotas del ítem se
          mantienen intactas.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancelMode}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px]"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirmCancel}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px] bg-status-error-fg text-background hover:bg-status-error-fg/90"
          >
            {busy === "cancel" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Eliminar"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "confirmingEnd") {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-ds-text-2">
          A partir de esta fecha no se proyectarán más cuotas. Las ocurrencias
          ya pagadas quedan intactas.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancelMode}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px]"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirmEnd}
            disabled={busy !== null}
            className="flex-1 h-11 text-[13px] bg-status-warn-fg text-background hover:bg-status-warn-fg/90"
          >
            {busy === "end" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Terminar"
            )}
          </Button>
        </div>
      </div>
    );
  }

  // idle: menú principal
  void currentAmount;
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={onStartMove}
        className="w-full h-11 text-[13px] justify-start"
      >
        <Move className="h-4 w-4 mr-2" /> Mover a otro período
      </Button>
      <Button
        variant="outline"
        onClick={onStartEdit}
        className="w-full h-11 text-[13px] justify-start"
      >
        <Pencil className="h-4 w-4 mr-2" /> Editar monto
      </Button>
      <Button
        variant="outline"
        onClick={onStartCancel}
        className="w-full h-11 text-[13px] justify-start text-status-error-fg hover:bg-status-error-soft"
      >
        <Trash2 className="h-4 w-4 mr-2" /> Eliminar este monto
      </Button>
      <Button
        variant="outline"
        onClick={onStartEnd}
        className="w-full h-11 text-[13px] justify-start text-status-warn-fg hover:bg-status-warn-soft"
      >
        <CircleSlash className="h-4 w-4 mr-2" /> Terminar serie
      </Button>
    </div>
  );
}
