"use client";
import { useDroppable } from "@dnd-kit/core";
import type {
  ProjectionRowItemDetail,
  ProjectionBucket,
  FinanceCashflowItemSource,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { DragHandle } from "./DragHandle";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const SOURCE_BADGE: Record<FinanceCashflowItemSource, string | null> = {
  MANUAL: null,
  CONTRACT: "Contrato",
  PAYROLL: "Sueldos",
  RECURRING_DTE: "DTE recurrente",
  SUPPLIER: "Proveedor",
  IVA: "F29",
  TURNOS_EXTRA: "TE",
  OTHER: null,
};

function sourceLink(source: FinanceCashflowItemSource, item: ProjectionRowItemDetail): string | null {
  switch (source) {
    case "PAYROLL":
    case "TURNOS_EXTRA":
      return item.installationId ? `/configuracion/instalaciones/${item.installationId}` : null;
    case "CONTRACT":
      return item.itemId !== "_orphan" ? `/cpq/quotes/${item.itemId}` : null;
    default:
      return null;
  }
}

function DroppableSubCell({
  bucketKey,
  children,
  className = "",
}: {
  bucketKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketKey });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-status-info-soft transition-colors" : ""}`}
    >
      {children}
    </td>
  );
}

function firstMovableOccurrenceId(item: ProjectionRowItemDetail): string | null {
  for (const v of item.values) {
    if (v.occurrenceId) return v.occurrenceId;
  }
  return null;
}

interface Props {
  item: ProjectionRowItemDetail;
  buckets: ProjectionBucket[];
  granularity: "weekly" | "monthly";
  kind: "INCOME" | "EXPENSE";
  onActionDone: () => void;
}

export function ItemDetailRow({ item, buckets, granularity, kind, onActionDone }: Props) {
  const badge = SOURCE_BADGE[item.source];
  const link = sourceLink(item.source, item);
  const display = item.installationName ?? item.itemName;

  return (
    <tr className="bg-muted/10 hover:bg-muted/20 border-t border-border/50">
      <td className="sticky left-0 z-20 bg-muted/10 p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none">
        <div className="flex items-center gap-1.5 pl-3">
          <DragHandle occurrenceId={firstMovableOccurrenceId(item)} />
          {link ? (
            <a
              href={link}
              className="text-[12px] text-ds-text-2 hover:underline truncate"
              title={display}
            >
              {display}
            </a>
          ) : (
            <span className="text-[12px] text-ds-text-2 truncate" title={display}>
              {display}
            </span>
          )}
          {badge && (
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-4 shrink-0">
              {badge}
            </span>
          )}
        </div>
      </td>
      {item.values.map((v) => {
        const variance = v.actualAmount !== null ? v.actualAmount - v.amount : null;
        const cellContent = (
          <CellAmount
            projected={v.amount}
            actual={v.actualAmount}
            variance={variance}
            kind={kind}
          />
        );
        const target = v.occurrenceId ? { id: v.occurrenceId, amountClp: v.amount } : null;
        return (
          <DroppableSubCell
            key={v.bucketKey}
            bucketKey={v.bucketKey}
            className="p-2 text-right text-ds-text-2 whitespace-nowrap"
          >
            <CellActionPopover
              target={target}
              granularity={granularity}
              onActionDone={onActionDone}
            >
              {cellContent}
            </CellActionPopover>
          </DroppableSubCell>
        );
      })}
      <td className="sticky right-0 z-20 p-2 text-right font-mono bg-muted/30 whitespace-nowrap text-[12px] text-ds-text-2">
        {fmt.format(item.total)}
      </td>
    </tr>
  );
}
