"use client";

import { CheckCircle2, Link2, ListTodo, Sparkles, TicketPlus, UserPlus, Users, CalendarPlus } from "lucide-react";
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

/**
 * Tab Resumen del Panel de trabajo (Bloque 4): acciones transversales grandes
 * (ticket / reunión con IA) y chips secundarios según los módulos del usuario
 * (unión). Cada acción valida su módulo en servidor; asociar/tarea/ticket/
 * reunión sólo requieren Productividad.
 */
export function CorreoWorkSummary({ threadId, accountId, hasLead, aiOpen, setAiOpen, onRefresh, onGoTo }: Props) {
  const perms = useEffectivePermissions();
  const hasCrm = hasModuleAccess(perms, "crm");
  const hasOps = hasModuleAccess(perms, "ops");

  return (
    <div className="space-y-3">
      {/* Acciones transversales (sólo Productividad). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <BigAction icon={TicketPlus} label="✦ Crear ticket con IA" onClick={() => onGoTo("productividad")} />
        <BigAction icon={CalendarPlus} label="Proponer reunión con IA" onClick={() => onGoTo("reunion")} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Quick icon={Link2} label="Vincular" onClick={() => onGoTo("vinculos")} />
        <Quick icon={ListTodo} label="Tareas" onClick={() => onGoTo("productividad")} />
      </div>

      {/* Chips por módulo (unión). El gating final es server-side por acción. */}
      <div className="flex flex-wrap gap-2">
        {hasCrm &&
          (hasLead ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-status-ok-border bg-status-ok-soft px-3 py-1.5 text-[12px] text-status-ok-fg">
              <CheckCircle2 className="h-3.5 w-3.5" /> Lead creado
            </span>
          ) : (
            <Chip icon={Sparkles} label="Crear lead" onClick={() => setAiOpen(true)} accent />
          ))}
        {hasOps && <Chip icon={Sparkles} label="Reportar incidente" onClick={() => onGoTo("productividad")} />}
        {hasOps && <Chip icon={Users} label="Crear candidato" href="/ops/ats" />}
        {hasCrm && !accountId && <Chip icon={UserPlus} label="Asociar cuenta" onClick={() => onGoTo("cuenta")} />}
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

function BigAction({ icon: Icon, label, onClick }: { icon: typeof Sparkles; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 flex-col items-start justify-center gap-1 rounded-xl border border-ds-border-default bg-ds-surface-1 p-3 text-left ds-tap hover:border-tint-violet"
    >
      <Icon className="h-5 w-5 text-tint-violet-fg" />
      <span className="text-[13px] font-medium text-ds-text-1">{label}</span>
    </button>
  );
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Sparkles; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 ds-tap hover:border-primary"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Chip({
  icon: Icon,
  label,
  onClick,
  href,
  accent,
}: {
  icon: typeof Sparkles;
  label: string;
  onClick?: () => void;
  href?: string;
  accent?: boolean;
}) {
  const cls = `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] ds-tap ${
    accent
      ? "border-tint-violet/40 bg-tint-violet/15 text-tint-violet-fg"
      : "border-ds-border-default bg-ds-surface-1 text-ds-text-1 hover:border-primary"
  }`;
  if (href) {
    return (
      <a href={href} className={cls}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
