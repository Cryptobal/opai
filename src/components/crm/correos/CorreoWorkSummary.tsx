"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Link2,
  ListChecks,
  ListTodo,
  Paperclip,
  Sparkles,
  TicketPlus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import type { WorkTab } from "./work-panel-tabs";

type Props = {
  threadId: string;
  accountId: string | null;
  accountName?: string | null;
  dealTitle?: string | null;
  hasLead: boolean;
  attachmentCount?: number;
  attachmentsSaved?: number;
  /** Abre el panel unificado de Acciones IA (comando lead). */
  onOpenAiLead: () => void;
  /** Abre el panel con comando analizar (plan de acciones). */
  onOpenAiAnalizar?: () => void;
  onGoTo: (tab: WorkTab) => void;
};

type Tone = "violet" | "emerald" | "amber" | "sky";
const TONE: Record<Tone, string> = {
  violet: "bg-tint-violet text-tint-violet-fg",
  emerald: "bg-tint-emerald text-tint-emerald-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
};

type ThreadStats = {
  contactName: string | null;
  installationCount: number | null;
  openTaskCount: number | null;
  ticketCount: number | null;
};

/**
 * Tab Resumen/Copiloto del Panel de trabajo: acciones + estado del hilo con
 * datos reales (cuenta, negocio, contacto, contadores).
 */
export function CorreoWorkSummary({
  threadId,
  accountId,
  accountName,
  dealTitle,
  hasLead,
  attachmentCount,
  attachmentsSaved,
  onOpenAiLead,
  onOpenAiAnalizar,
  onGoTo,
}: Props) {
  const perms = useEffectivePermissions();
  const hasCrm = hasModuleAccess(perms, "crm");
  const hasOps = hasModuleAccess(perms, "ops");
  const [stats, setStats] = useState<ThreadStats>({
    contactName: null,
    installationCount: null,
    openTaskCount: null,
    ticketCount: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [contactRes, linksRes, tasksRes] = await Promise.all([
        fetch(`/api/crm/correos/${threadId}/contact-context`).then((r) => r.json()).catch(() => null),
        fetch(`/api/crm/correos/${threadId}/links`).then((r) => r.json()).catch(() => null),
        fetch(`/api/crm/correos/${threadId}/tasks`).then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled) return;
      const links = Array.isArray(linksRes?.links) ? linksRes.links : [];
      const tasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [];
      const installations = links.filter(
        (l: { entityType?: string }) => l.entityType === "installation",
      );
      const tickets = links.filter(
        (l: { entityType?: string }) => l.entityType === "incidente",
      );
      setStats({
        contactName:
          typeof contactRes?.contact?.name === "string" ? contactRes.contact.name : null,
        installationCount: installations.length,
        openTaskCount: tasks.filter((t: { status?: string }) => t.status !== "done").length,
        ticketCount: tickets.length,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const accountValue = accountId
    ? accountName?.trim() || "Cuenta"
    : "Sin cuenta";
  const dealValue = dealTitle?.trim() || null;
  const contactValue = stats.contactName;
  const attachmentsValue =
    attachmentCount != null
      ? attachmentsSaved != null && attachmentsSaved > 0
        ? `${attachmentCount} · ${attachmentsSaved} guardado${attachmentsSaved === 1 ? "" : "s"}`
        : String(attachmentCount)
      : null;
  const workParts: string[] = [];
  if (stats.openTaskCount != null) {
    workParts.push(
      stats.openTaskCount === 0
        ? "Sin tareas abiertas"
        : `${stats.openTaskCount} tarea${stats.openTaskCount === 1 ? "" : "s"}`,
    );
  }
  if (stats.ticketCount != null && stats.ticketCount > 0) {
    workParts.push(`${stats.ticketCount} ticket${stats.ticketCount === 1 ? "" : "s"}`);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {onOpenAiAnalizar && (
          <Tile
            tone="violet"
            icon={Sparkles}
            title="✦ Analizar con IA"
            subtitle="Plan de acciones"
            onClick={onOpenAiAnalizar}
          />
        )}
        <Tile tone="violet" icon={TicketPlus} title="Crear ticket" subtitle="✦ con IA" onClick={() => onGoTo("productividad")} />
        <Tile tone="violet" icon={CalendarPlus} title="Proponer reunión" subtitle="✦ con IA" onClick={() => onGoTo("productividad")} />
        <Tile tone="emerald" icon={ListTodo} title="Crear tarea" subtitle="Seguimiento" onClick={() => onGoTo("productividad")} />
        {hasCrm &&
          (hasLead ? (
            <Tile tone="emerald" icon={CheckCircle2} title="Lead creado" subtitle="En comercial" chip="CRM" done />
          ) : (
            <Tile tone="emerald" icon={UserPlus} title="Crear lead" subtitle="Desde el hilo" chip="CRM" onClick={onOpenAiLead} />
          ))}
        {hasOps && <Tile tone="amber" icon={AlertTriangle} title="Reportar incidente" subtitle="Operaciones" chip="OPS" onClick={() => onGoTo("productividad")} />}
        {hasOps && <Tile tone="sky" icon={UserPlus} title="Crear candidato" subtitle="Postulación" chip="RRHH" href="/ops/ats" />}
      </div>

      <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-2">
        <p className="px-3 pt-2 text-[12px] font-medium text-ds-text-3">Estado del hilo</p>
        <StatusRow
          icon={Building2}
          label="Cuenta"
          value={dealValue ? `${accountValue} · ${dealValue}` : accountValue}
          onClick={() => onGoTo("cuenta")}
        />
        {contactValue && (
          <StatusRow icon={UserPlus} label="Contacto" value={contactValue} onClick={() => onGoTo("cuenta")} />
        )}
        <StatusRow
          icon={Link2}
          label="Vínculos"
          value={
            stats.installationCount != null
              ? stats.installationCount === 0
                ? "Sin instalaciones"
                : `${stats.installationCount} instalación${stats.installationCount === 1 ? "" : "es"}`
              : "Ver relaciones"
          }
          onClick={() => onGoTo("vinculos")}
        />
        {attachmentsValue != null && (
          <StatusRow
            icon={Paperclip}
            label="Adjuntos"
            value={attachmentsValue}
            onClick={() => onGoTo("vinculos")}
          />
        )}
        <StatusRow
          icon={ListChecks}
          label="Trabajo"
          value={workParts.length > 0 ? workParts.join(" · ") : "Tareas y tickets"}
          onClick={() => onGoTo("productividad")}
        />
      </div>
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
          <span className="rounded-full bg-ds-surface-3 px-1.5 py-0.5 text-[12px] font-mono uppercase tracking-[0.06em] text-ds-text-3">
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

function StatusRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
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
