import { cn } from "@/lib/utils";

type StatusVariant = "en_curso" | "completada" | "atrasada" | "pendiente" | "no_realizada" | "critica" | "warning" | "info";

const STATUS_CONFIG: Record<StatusVariant, { label: string; dot: string; bg: string; text: string; border: string }> = {
  en_curso:      { label: "En curso",      dot: "bg-blue-400",    bg: "bg-status-info-soft",   text: "text-status-info-fg",   border: "border-status-info-border" },
  completada:    { label: "Completada",    dot: "bg-green-400",   bg: "bg-status-ok-soft",  text: "text-status-ok-fg",  border: "border-green-500/20" },
  atrasada:      { label: "Atrasada",      dot: "bg-red-400",     bg: "bg-status-danger-soft",    text: "text-status-danger-fg",    border: "border-status-danger-border" },
  pendiente:     { label: "Pendiente",     dot: "bg-amber-400",   bg: "bg-status-warn-soft",  text: "text-status-warn-fg",  border: "border-status-warn-border" },
  no_realizada:  { label: "No realizada",  dot: "bg-[#64748b]",   bg: "bg-white/5",       text: "text-[#94a3b8]",  border: "border-white/10" },
  critica:       { label: "Crítica",       dot: "bg-red-400 animate-pulse", bg: "bg-status-danger-soft",    text: "text-status-danger-fg",    border: "border-status-danger-border" },
  warning:       { label: "Warning",       dot: "bg-amber-400",   bg: "bg-status-warn-soft",  text: "text-status-warn-fg",  border: "border-status-warn-border" },
  info:          { label: "Info",          dot: "bg-blue-400",    bg: "bg-status-info-soft",   text: "text-status-info-fg",   border: "border-status-info-border" },
};

export function normalizeStatus(raw: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    EN_CURSO: "en_curso",
    COMPLETADA: "completada",
    ATRASADA: "atrasada",
    PENDIENTE: "pendiente",
    NO_REALIZADA: "no_realizada",
    en_curso: "en_curso",
    completada: "completada",
    atrasada: "atrasada",
    pendiente: "pendiente",
    no_realizada: "no_realizada",
    CRITICA: "critica",
    WARNING: "warning",
    INFO: "info",
  };
  return map[raw] ?? "pendiente";
}

export function StatusBadge({ status, customLabel }: { status: StatusVariant | string; customLabel?: string }) {
  const variant = normalizeStatus(status);
  const cfg = STATUS_CONFIG[variant] ?? STATUS_CONFIG.pendiente;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
      cfg.bg, cfg.text, cfg.border
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dot)} />
      {customLabel ?? cfg.label}
    </span>
  );
}
