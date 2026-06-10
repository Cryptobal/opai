import {
  Check,
  CheckCheck,
  ArrowUpRight,
  FileText,
  Pencil,
  Calendar,
  AlertTriangle,
  Ban,
} from "lucide-react";
import type { CashflowCellStatus } from "@/modules/finance/cashflow/types";

export type PillVariant =
  | "PAID"
  | "FACTORING"
  | "FACTORING_COLLECTED"
  | "INVOICED"
  | "DRAFT"
  | "PROJECTED"
  | "OVERDUE"
  | "VOIDED";

interface Props {
  variant: PillVariant;
  compact?: boolean;
  className?: string;
}

const META: Record<PillVariant, {
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  fg: string;
}> = {
  PAID:       { label: "Pagada",      short: "PAG",  icon: Check,          bg: "bg-emerald-500/15",  fg: "text-emerald-300" },
  FACTORING:  { label: "Factorizada", short: "FACT", icon: ArrowUpRight,   bg: "bg-purple-500/15",   fg: "text-purple-300" },
  FACTORING_COLLECTED: { label: "Factorizada · cobrada", short: "FACT✓", icon: CheckCheck, bg: "bg-teal-500/15", fg: "text-teal-300" },
  INVOICED:   { label: "Facturada",   short: "FAC",  icon: FileText,       bg: "bg-blue-500/15",     fg: "text-blue-300" },
  DRAFT:      { label: "Borrador",    short: "BOR",  icon: Pencil,         bg: "bg-amber-500/15",    fg: "text-amber-300" },
  PROJECTED:  { label: "Programada",  short: "PROG", icon: Calendar,       bg: "bg-muted/40",        fg: "text-ds-text-3" },
  OVERDUE:    { label: "Vencida",     short: "VEN",  icon: AlertTriangle,  bg: "bg-red-500/15",      fg: "text-red-300" },
  VOIDED:     { label: "Anulada",     short: "NC",   icon: Ban,            bg: "bg-pink-500/15",     fg: "text-pink-300 line-through" },
};

export function CellStatusPill({ variant, compact = false, className = "" }: Props) {
  const m = META[variant];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-ds-sm text-[10px] font-mono font-medium tracking-[0.04em] ${m.bg} ${m.fg} ${className}`}
      title={m.label}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span>{compact ? m.short : m.label.toUpperCase()}</span>
    </span>
  );
}

export function pillVariantFor(input: {
  cellStatus: CashflowCellStatus;
  hasFactoring?: boolean;
  /** Cedida a factoring y depósito ya conciliado (op FUNDED/COLLECTED): la
   *  plata entró al banco → "Factorizada · cobrada" en vez de "Factorizada". */
  factoringCollected?: boolean;
  daysOverdue?: number;
  voided?: boolean;
}): PillVariant {
  // Ciclo de vida de una factura, como UNA sola etapa visible:
  //   Programada → Borrador → Facturada → Factorizada (factoring, opcional)
  //   con Pagada como terminal y Vencida/Anulada como modificadores.
  // El factoring se integra como etapa (Factorizada) en vez de un badge "F"
  // suelto: en este negocio un contrato factoring se cede al emitir cada
  // factura, así que una factura emitida con modoCobro FACTORING (o cellStatus
  // CEDED) ya está factorizada.
  if (input.voided) return "VOIDED";
  if (input.cellStatus === "VOIDED") return "VOIDED";
  if ((input.daysOverdue ?? 0) > 0 && input.cellStatus !== "PAID") return "OVERDUE";
  if (input.cellStatus === "PAID") return "PAID";
  if (input.cellStatus === "CEDED") {
    // Cedida + depósito ya conciliado → "Factorizada · cobrada" (la plata entró
    // al banco aunque el DTE siga CEDED). Sin conciliar → "Factorizada" plana.
    return input.factoringCollected ? "FACTORING_COLLECTED" : "FACTORING";
  }
  if (input.cellStatus === "INVOICED") {
    // Facturada. "Factorizada" se reserva para cuando la factura se CEDIÓ de
    // verdad (cellStatus=CEDED), NO por el modoCobro del contrato: una factura
    // recién emitida en un contrato factoring todavía no está cedida, así que
    // mostrarla como "Factorizada" es incorrecto (ej. Ametel 1717).
    return "INVOICED";
  }
  if (input.cellStatus === "DRAFT") return "DRAFT";
  // Aún sin DTE: programada (proyección recurrente/contrato). El factoring
  // recién se marca cuando hay emisión/cesión, no en la proyección.
  return "PROJECTED";
}
