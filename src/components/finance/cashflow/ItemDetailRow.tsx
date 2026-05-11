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
      // Para contratos preferimos llevar al tab "Contratos" de la cuenta CRM
      // (donde el usuario gestiona los PDFs y la vinculación). Si no hay
      // crmAccountId, fallback a la cotización origen.
      if (item.crmAccountId) {
        return `/crm/accounts/${item.crmAccountId}?tab=contracts`;
      }
      return item.itemId !== "_orphan" ? `/crm/cotizaciones/${item.itemId}` : null;
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

function firstMovableValue(
  item: ProjectionRowItemDetail,
): { occurrenceId: string | null; scheduledDate: string } | null {
  if (item.itemId === "_orphan") return null;
  for (const v of item.values) {
    if (v.amount > 0 || v.occurrenceId) {
      return { occurrenceId: v.occurrenceId, scheduledDate: v.scheduledDate };
    }
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
  // Mostrar cliente como prefix sólo cuando es distinto del nombre (evita
  // duplicación "Ametel — Ametel algarrobo" cuando la instalación ya
  // contiene el nombre del cliente).
  const showAccount =
    item.crmAccountName &&
    !display.toLowerCase().includes(item.crmAccountName.toLowerCase());
  const handleTarget = firstMovableValue(item);

  return (
    <tr className="bg-muted/10 hover:bg-muted/20 border-t border-border/50">
      <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
        <div className="flex items-center gap-1.5 pl-3">
          {handleTarget && (
            <DragHandle
              occurrenceId={handleTarget.occurrenceId}
              itemId={item.itemId}
              originalDate={handleTarget.scheduledDate}
            />
          )}
          {showAccount ? (
            <span
              className="text-[11px] font-mono uppercase tracking-[0.06em] text-ds-text-4 shrink-0"
              title={item.crmAccountName ?? undefined}
            >
              {item.crmAccountName} ·
            </span>
          ) : null}
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
          {item.currency === "UF" && (
            <span
              className="text-[10px] font-mono font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg shrink-0"
              title="Contrato indexado a UF — el monto se recalcula mes a mes con la UF de cada cuota"
            >
              UF
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
        const target =
          item.itemId !== "_orphan" && (v.amount > 0 || v.occurrenceId)
            ? {
                id: v.occurrenceId,
                itemId: item.itemId,
                originalDate: v.scheduledDate,
                amountClp: v.amount,
              }
            : null;
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
      <td className="sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap text-[12px] text-ds-text-2 border-l border-border/50">
        {fmt.format(item.total)}
      </td>
    </tr>
  );
}
