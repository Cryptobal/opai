"use client";

import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Link2,
  ListChecks,
  ListTodo,
  Sparkles,
  TicketPlus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import type { WorkTab } from "./work-panel-tabs";

type Props = {
  threadId: string;
  accountId: string | null;
  hasLead: boolean;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  onRefresh: () => void;
  onGoTo: (tab: WorkTab) => void;
};

type Tone = "violet" | "emerald" | "amber" | "sky";
const TONE: Record<Tone, string> = {
  violet: "bg-tint-violet text-tint-violet-fg",
  emerald: "bg-tint-emerald text-tint-emerald-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
};

/**
 * Tab Resumen del Panel de trabajo (v3.1): grilla homogénea de celdas de acción
 * con color semántico por tipo (Ticket/Reunión violeta, Tarea/Lead verde,
 * Incidente ámbar, Candidato celeste). Las acciones por módulo llevan micro-chip
 * (CRM/OPS/RRHH) y sólo aparecen si el usuario tiene ese módulo; el gating final
 * es server-side. Debajo, tarjeta "Estado del hilo" con filas navegables.
 */
export function CorreoWorkSummary({ threadId, accountId, hasLead, aiOpen, setAiOpen, onRefresh, onGoTo }: Props) {
  const perms = useEffectivePermissions();
  const hasCrm = hasModuleAccess(perms, "crm");
  const hasOps = hasModuleAccess(perms, "ops");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile tone="violet" icon={TicketPlus} title="Crear ticket" subtitle="✦ con IA" onClick={() => onGoTo("productividad")} />
        <Tile tone="violet" icon={CalendarPlus} title="Proponer reunión" subtitle="✦ con IA" onClick={() => onGoTo("reunion")} />
        <Tile tone="emerald" icon={ListTodo} title="Crear tarea" subtitle="Seguimiento" onClick={() => onGoTo("productividad")} />
        {hasCrm &&
          (hasLead ? (
            <Tile tone="emerald" icon={CheckCircle2} title="Lead creado" subtitle="En comercial" chip="CRM" done />
          ) : (
            <Tile tone="emerald" icon={Sparkles} title="Crear lead" subtitle="Desde el hilo" chip="CRM" onClick={() => setAiOpen(true)} />
          ))}
        {hasOps && <Tile tone="amber" icon={AlertTriangle} title="Reportar incidente" subtitle="Operaciones" chip="OPS" onClick={() => onGoTo("productividad")} />}
        {hasOps && <Tile tone="sky" icon={UserPlus} title="Crear candidato" subtitle="Postulación" chip="RRHH" href="/ops/ats" />}
      </div>

      <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-2">
        <p className="px-3 pt-2 text-[12px] font-medium text-ds-text-3">Estado del hilo</p>
        <StatusRow icon={Building2} label="Cuenta" value={accountId ? "Cuenta asociada" : "Sin cuenta"} onClick={() => onGoTo("cuenta")} />
        <StatusRow icon={Link2} label="Vínculos" value="Ver relaciones" onClick={() => onGoTo("vinculos")} />
        <StatusRow icon={ListChecks} label="Seguimiento" value="Tareas y tickets" onClick={() => onGoTo("productividad")} />
      </div>

      {hasCrm && !hasLead && aiOpen && (
        <LeadFromEmailPanel
          threadId={threadId}
          hasAccount={Boolean(accountId)}
          onClose={() => setAiOpen(false)}
          onCreated={() => {
            setAiOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function Tile({
  tone,
  icon: Icon,
  title,
  subtitle,
  chip,
  onClick,
  href,
  done,
}: {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  chip?: string;
  onClick?: () => void;
  href?: string;
  done?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${TONE[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        {chip && (
          <span className="rounded-full bg-ds-surface-3 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.06em] text-ds-text-3">
            {chip}
          </span>
        )}
      </div>
      <span className="mt-1.5 text-[13px] font-medium leading-tight text-ds-text-1">{title}</span>
      <span className="text-[12px] leading-tight text-ds-text-3">{subtitle}</span>
    </>
  );
  const cls = `flex min-h-[76px] flex-col rounded-xl border p-2.5 text-left ds-tap ${
    done ? "border-status-ok-border bg-status-ok-soft/40" : "border-ds-border-default bg-ds-surface-1"
  }`;
  if (href) return <a href={href} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function StatusRow({ icon: Icon, label, value, onClick }: { icon: LucideIcon; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left ds-tap hover:bg-ds-surface-3"
    >
      <Icon className="h-4 w-4 shrink-0 text-ds-text-3" />
      <span className="text-[13px] font-medium text-ds-text-1">{label}</span>
      <span className="ml-auto truncate text-[12px] text-ds-text-3">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
    </button>
  );
}
