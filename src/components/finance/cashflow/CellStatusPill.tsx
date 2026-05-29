import {
  Check,
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
  PAID:       { label: "Pagada",     short: "PAG",  icon: Check,          bg: "bg-emerald-500/15",  fg: "text-emerald-300" },
  FACTORING:  { label: "Factoring",  short: "FACT", icon: ArrowUpRight,   bg: "bg-purple-500/15",   fg: "text-purple-300" },
  INVOICED:   { label: "Emitida",    short: "EMI",  icon: FileText,       bg: "bg-blue-500/15",     fg: "text-blue-300" },
  DRAFT:      { label: "Borrador",   short: "BOR",  icon: Pencil,         bg: "bg-amber-500/15",    fg: "text-amber-300" },
  PROJECTED:  { label: "Proyectada", short: "PRO",  icon: Calendar,       bg: "bg-muted/40",        fg: "text-ds-text-3" },
  OVERDUE:    { label: "Vencida",    short: "VEN",  icon: AlertTriangle,  bg: "bg-red-500/15",      fg: "text-red-300" },
  VOIDED:     { label: "Anulada",    short: "NC",   icon: Ban,            bg: "bg-pink-500/15",     fg: "text-pink-300 line-through" },
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
  daysOverdue?: number;
  voided?: boolean;
}): PillVariant {
  // El factoring NO es estado del DTE — se indica con el badge "F" violeta
  // separado en MovementRow. Acá solo evaluamos el ciclo de vida del DTE
  // (PROJECTED → DRAFT → INVOICED → PAID, con overdue/voided como modificadores).
  if (input.voided) return "VOIDED";
  if (input.cellStatus === "VOIDED") return "VOIDED";
  if ((input.daysOverdue ?? 0) > 0 && input.cellStatus !== "PAID") return "OVERDUE";
  if (input.cellStatus === "PAID") return "PAID";
  if (input.cellStatus === "INVOICED") return "INVOICED";
  if (input.cellStatus === "DRAFT") return "DRAFT";
  // CEDED es un estado del flujo de factoring que ya cubrimos con el badge "F".
  // Si la occurrence está cedida pero no tiene DTE emitido todavía, sigue
  // siendo PROJECTED desde el punto de vista del flujo de caja.
  return "PROJECTED";
}
