"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
import { canEdit, hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  primaryActionCopy,
  resolveCorreoAiCommands,
  resolvePrimaryCorreoAiCommand,
  type CorreoAiCommandId,
} from "@/modules/crm/email/correo-ai-commands";
import { CorreoVerdictStrip } from "./CorreoVerdictStrip";
import { capsFromPerms } from "./CorreoAiMenu";
import type { WorkTab } from "./work-panel-tabs";

type Props = {
  threadId: string;
  accountId: string | null;
  accountName?: string | null;
  dealTitle?: string | null;
  hasLead: boolean;
  attachmentCount?: number;
  attachmentsSaved?: number;
  aiCategory?: string | null;
  aiVertical?: string | null;
  aiSummary?: string | null;
  aiUrgency?: string | null;
  aiClassifiedAt?: string | null;
  lastMessageAt?: string | null;
  dealFechaEntrega?: string | null;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onGoTo: (tab: WorkTab) => void;
};

type ThreadStats = {
  contactName: string | null;
  installationCount: number | null;
  openTaskCount: number | null;
  ticketCount: number | null;
};

/**
 * Tab Copiloto (id `resumen`): veredicto, acción principal por categoría,
 * chips secundarios y estado del hilo con datos reales.
 */
export function CorreoWorkSummary({
  threadId,
  accountId,
  accountName,
  dealTitle,
  hasLead,
  attachmentCount,
  attachmentsSaved,
  aiCategory = null,
  aiVertical = null,
  aiSummary = null,
  aiUrgency = null,
  aiClassifiedAt = null,
  lastMessageAt = null,
  dealFechaEntrega = null,
  onOpenAiLead,
  onAiCommand,
  onGoTo,
}: Props) {
  const perms = useEffectivePermissions();
  const hasCrm = hasModuleAccess(perms, "crm");
  const hasOps = hasModuleAccess(perms, "ops");
  const caps = useMemo(() => capsFromPerms(perms), [perms]);
  const canEditCorreos = canEdit(perms, "crm", "correos");

  const primary = useMemo(
    () => resolvePrimaryCorreoAiCommand(aiCategory, aiVertical, caps, { canEditCorreos }),
    [aiCategory, aiVertical, caps, canEditCorreos],
  );
  const secondary = useMemo(() => {
    const { primary: p, more } = resolveCorreoAiCommands(aiVertical, caps, { canEditCorreos });
    return [...p, ...more].filter((c) => c.id !== primary?.id && c.kind === "panel").slice(0, 6);
  }, [aiVertical, caps, canEditCorreos, primary?.id]);

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

  const primaryCopy = primary
    ? primaryActionCopy(aiCategory, primary.id)
    : null;

  function runCommand(id: CorreoAiCommandId) {
    if (id === "lead") {
      onOpenAiLead();
      return;
    }
    onAiCommand?.(id);
  }

  return (
    <div className="ds-page-enter space-y-3">
      <CorreoVerdictStrip
        data={{
          aiCategory,
          aiSummary,
          aiUrgency,
          aiClassifiedAt,
          lastMessageAt,
          dealFechaEntrega,
        }}
      />

      {primary && primaryCopy && (
        <button
          type="button"
          onClick={() => runCommand(primary.id)}
          className="flex min-h-[72px] w-full flex-col items-start gap-1 rounded-2xl border border-tint-violet/40 bg-tint-violet/10 px-3.5 py-3 text-left ds-tap"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-tint-violet-fg">
            <Sparkles className="h-4 w-4" /> ✦ {primaryCopy.title}
          </span>
          <span className="text-[12px] leading-snug text-ds-text-2">{primaryCopy.subtitle}</span>
        </button>
      )}

      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {secondary.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={() => runCommand(cmd.id)}
              className="inline-flex min-h-11 items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] font-medium text-ds-text-2 ds-tap hover:border-primary sm:min-h-8"
            >
              {cmd.shortLabel}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip icon={TicketPlus} label="Ticket" onClick={() => onGoTo("productividad")} />
        <Chip icon={CalendarPlus} label="Reunión" onClick={() => onGoTo("productividad")} />
        <Chip icon={ListTodo} label="Tarea" onClick={() => onGoTo("productividad")} />
        {hasCrm &&
          (hasLead ? (
            <span className="inline-flex min-h-11 items-center gap-1 rounded-full border border-status-ok-border bg-status-ok-soft px-3 text-[12px] text-status-ok-fg sm:min-h-8">
              <CheckCircle2 className="h-3.5 w-3.5" /> Lead creado
            </span>
          ) : (
            <Chip icon={UserPlus} label="Lead" onClick={onOpenAiLead} />
          ))}
        {hasOps && <Chip icon={UserPlus} label="Candidato" href="/ops/ats" />}
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

function Chip({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const cls =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] font-medium text-ds-text-2 ds-tap hover:border-primary sm:min-h-8";
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
