"use client";
import { useDroppable } from "@dnd-kit/core";
import { TrendingUp } from "lucide-react";
import type {
  ProjectionRowItemDetail,
  ProjectionBucket,
  FinanceCashflowItemSource,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";

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
  QUINCENA: "Quincena",
  RETIRO_SOCIO: "Retiro socio",
  AJUSTE: "Ajuste",
  OTHER: null,
};

function sourceLink(source: FinanceCashflowItemSource, item: ProjectionRowItemDetail): string | null {
  // Fallback genérico para cualquier fuente: si el item tiene cuenta CRM
  // o instalación, podemos llevar ahí incluso si no hay match específico
  // abajo. Eso evita filas "no clickeables" cuando el contexto existe.
  const fallback = item.crmAccountId
    ? `/crm/accounts/${item.crmAccountId}?tab=contracts`
    : item.installationId
      ? `/crm/installations/${item.installationId}`
      : null;

  switch (source) {
    case "PAYROLL":
    case "PAYROLL_LIQUIDO":
    case "PAYROLL_PREVIRED":
    case "TURNOS_EXTRA":
      // Deep-link al ancla `#puestos` de la página de la instalación: ahí
      // el usuario edita los puestos operativos (fuente de verdad del sueldo).
      return item.installationId
        ? `/crm/installations/${item.installationId}#puestos`
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

interface Props {
  item: ProjectionRowItemDetail;
  buckets: ProjectionBucket[];
  granularity: "weekly" | "monthly";
  kind: "INCOME" | "EXPENSE";
  /** Ajustes IPC PENDING indexados por `${itemId}_${bucketKey}`. La celda
   *  con marker queda resaltada en ámbar + icono TrendingUp. */
  ipcPending?: Map<string, Array<{ id: string; dueDate: string }>>;
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
  ipcPending,
  onActionDone,
  inGroup = false,
}: Props) {
  const badge = SOURCE_BADGE[item.source];
  const link = sourceLink(item.source, item);
  // BLOQUE 5 / Fase 6: el nickname (alias visible del contrato) tiene
  // prioridad sobre installationName e itemName cuando está configurado.
  // Permite distinguir varios contratos del mismo cliente con la misma
  // instalación (ej. "Ciclo proforma" vs "Facturación directa" en
  // Transmat). Fallback al patrón histórico si está vacío.
  const display = item.nickname ?? item.installationName ?? item.itemName;
  // Si el item está dentro de un grupo por cliente, ocultamos el prefix
  // del cliente porque el sub-header ya lo dice. En items planos
  // mantenemos el prefix sólo cuando el cliente no está ya en el nombre.
  const showAccount =
    !inGroup &&
    item.crmAccountName &&
    !display.toLowerCase().includes(item.crmAccountName.toLowerCase());

  return (
    <tr className="bg-muted/10 hover:bg-muted/20 border-t border-border/50">
      <td className="sticky left-0 z-20 bg-card p-2 min-w-[140px] max-w-[200px] sm:min-w-[180px] sm:max-w-[260px] border-r border-border/50">
        <div
          className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${inGroup ? "pl-8" : "pl-3"}`}
        >
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
              className="text-[12px] text-ds-text-2 hover:underline line-clamp-2 break-words"
              title={display}
            >
              {display}
            </a>
          ) : (
            <span
              className="text-[12px] text-ds-text-2 line-clamp-2 break-words"
              title={display}
            >
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
          {item.headcount > 0 ? (
            <span
              className="text-[11px] font-mono tabular-nums text-ds-text-3 shrink-0"
              title="Dotación planificada (puestos × turnos activos) de la instalación"
            >
              · {item.headcount} {item.headcount === 1 ? "persona" : "personas"}
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
          {/* Badge "IPC · Nm" del nombre eliminado intencionalmente —
              el indicador de reajuste ahora vive solo en la celda del
              bucket donde cae el dueDate (ámbar + TrendingUp). */}
        </div>
      </td>
      {item.values.map((v) => {
        const variance = v.actualAmount !== null ? v.actualAmount - v.amount : null;
        const ipcKey = `${item.itemId}_${v.bucketKey}`;
        const ipcMarker = ipcPending?.get(ipcKey)?.[0] ?? null;
        const cellContent = (
          <span className="inline-flex items-center justify-end gap-1">
            {ipcMarker && (
              <span
                title={`Reajuste IPC pendiente · vence ${ipcMarker.dueDate} — clic para aplicar`}
                className="inline-flex items-center gap-0.5 rounded-sm bg-status-warn-fg/15 px-1 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-[0.06em] text-status-warn-fg"
              >
                <TrendingUp className="h-2.5 w-2.5" />
                IPC
              </span>
            )}
            <CellAmount
              projected={v.amount}
              actual={v.actualAmount}
              variance={variance}
              kind={kind}
              cellStatus={v.cellStatus}
              daysOverdue={v.daysOverdue}
              dteFolio={v.dteFolio ?? null}
              dtes={v.dtes}
              modoCobro={item.modoCobro}
            />
          </span>
        );
        // Activamos el popover si: (a) hay proyección (amount>0), o
        // (b) hay Occurrence materializada en DB (occurrenceId), o
        // (c) hay DTEs vinculados a la celda (dtes.length>0).
        // El caso (c) cubre DTEs enganchados al item vía Occurrence
        // sintética con amountClp=0 (Bloque 2: factura/borrador
        // huérfano que cae en una celda sin proyección propia).
        // Sin (c), el popover quedaba deshabilitado y el usuario no
        // podía ver el detalle del DTE ni operar sobre la celda.
        const hasLinkedDtes = (v.dtes ?? []).length > 0;
        const target =
          item.itemId !== "_orphan" &&
          (v.amount > 0 || v.occurrenceId || hasLinkedDtes)
            ? {
                id: v.occurrenceId,
                itemId: item.itemId,
                originalDate: v.scheduledDate,
                amountClp: v.amount,
                cellStatus: v.cellStatus,
                dteId: v.dteId ?? null,
                dteFolio: v.dteFolio ?? null,
                dteGrossAmount: v.dteGrossAmount ?? null,
                dtes: v.dtes ?? [],
                daysOverdue: v.daysOverdue ?? 0,
                crmAccountId: item.crmAccountId,
              }
            : null;
        return (
          <DroppableSubCell
            key={v.bucketKey}
            bucketKey={v.bucketKey}
            className={`p-2 text-right text-ds-text-2 whitespace-nowrap ${
              ipcMarker
                ? "bg-status-warn-soft ring-1 ring-status-warn-border ring-inset"
                : ""
            }`}
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
      <td className="hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap text-[12px] text-ds-text-2 border-l border-border/50">
        {fmt.format(item.total)}
      </td>
    </tr>
  );
}
