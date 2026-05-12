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
  PAYROLL_LIQUIDO: "Líquido",
  PAYROLL_PREVIRED: "PreviRed",
  RECURRING_DTE: "DTE recurrente",
  SUPPLIER: "Proveedor",
  IVA: "F29",
  TURNOS_EXTRA: "TE",
  OTHER: null,
};

function sourceLink(source: FinanceCashflowItemSource, item: ProjectionRowItemDetail): string | null {
  // Fallback genérico para cualquier fuente: si el item tiene cuenta CRM
  // o instalación, podemos llevar ahí incluso si no hay match específico
  // abajo. Eso evita filas "no clickeables" cuando el contexto existe.
  const fallback = item.crmAccountId
    ? `/crm/accounts/${item.crmAccountId}?tab=contracts`
    : item.installationId
      ? `/configuracion/instalaciones/${item.installationId}`
      : null;

  switch (source) {
    case "PAYROLL":
    case "PAYROLL_LIQUIDO":
    case "PAYROLL_PREVIRED":
    case "TURNOS_EXTRA":
      return item.installationId
        ? `/configuracion/instalaciones/${item.installationId}`
        : fallback;
    case "CONTRACT":
      // Para contratos preferimos llevar al tab "Contratos" de la cuenta CRM
      // (donde el usuario gestiona los PDFs y la vinculación). Si no hay
      // crmAccountId, fallback a la cotización origen.
      if (item.crmAccountId) {
        return `/crm/accounts/${item.crmAccountId}?tab=contracts`;
      }
      return item.itemId !== "_orphan" ? `/crm/cotizaciones/${item.itemId}` : null;
    case "OTHER":
      // OTHER cubre los contratos subidos manualmente y los generados
      // desde plantilla CPQ (Document.source=OTHER). Llevamos al tab
      // de contratos del cliente cuando hay crmAccountId.
      return fallback;
    case "MANUAL":
      // Item manual: si tiene cuenta o instalación, llevamos ahí; si no,
      // queda sin link (el usuario crea desde "Nuevo item rápido").
      return fallback;
    case "SUPPLIER":
      // Item de proveedor recurrente — sin entidad CRM hoy, fallback al
      // contexto que tenga (cuenta o instalación).
      return fallback;
    default:
      return fallback;
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
  /** Si está dentro de un grupo por cliente, lo indentamos más para
   *  marcar visualmente la jerarquía. */
  inGroup?: boolean;
}

function formatBaseAmount(amount: number, currency: string): string {
  if (currency === "UF") {
    return `UF ${new Intl.NumberFormat("es-CL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)}/mes`;
  }
  return `$${new Intl.NumberFormat("es-CL", {
    maximumFractionDigits: 0,
  }).format(amount)}/mes`;
}

export function ItemDetailRow({
  item,
  buckets,
  granularity,
  kind,
  onActionDone,
  inGroup = false,
}: Props) {
  const badge = SOURCE_BADGE[item.source];
  const link = sourceLink(item.source, item);
  const display = item.installationName ?? item.itemName;
  // Si el item está dentro de un grupo por cliente, ocultamos el prefix
  // del cliente porque el sub-header ya lo dice. En items planos
  // mantenemos el prefix sólo cuando el cliente no está ya en el nombre.
  const showAccount =
    !inGroup &&
    item.crmAccountName &&
    !display.toLowerCase().includes(item.crmAccountName.toLowerCase());
  const handleTarget = firstMovableValue(item);

  return (
    <tr className="bg-muted/10 hover:bg-muted/20 border-t border-border/50">
      <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
        <div className={`flex items-center gap-1.5 ${inGroup ? "pl-8" : "pl-3"}`}>
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
          {item.baseAmount > 0 ? (
            <span
              className="text-[11px] font-mono tabular-nums text-ds-text-3 shrink-0"
              title="Monto base del contrato. Las celdas muestran el total proyectado por bucket."
            >
              · {formatBaseAmount(item.baseAmount, item.currency)}
            </span>
          ) : null}
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
