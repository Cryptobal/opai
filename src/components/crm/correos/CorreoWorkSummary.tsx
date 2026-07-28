"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Link2,
  ListChecks,
  Paperclip,
  Plus,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  primaryActionCopy,
  resolveCorreoAiCommands,
  resolvePrimaryCorreoAiCommand,
  type CorreoAiCommandId,
} from "@/modules/crm/email/correo-ai-commands";
import { resolveContinueActions } from "@/modules/crm/email/correo-continue-actions";
import { CorreoVerdictStrip } from "./CorreoVerdictStrip";
import { CorreoThreadSummaryCard } from "./CorreoThreadSummaryCard";
import { capsFromPerms } from "./CorreoAiMenu";
import type { WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  /** Cursor de lectura capturado al abrir (antes del markRead). */
  readCursorAt: string | null;
  /** Oculta secciones densas en altura media del sheet móvil. */
  peekMode?: boolean;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onGoTo: (tab: WorkTab) => void;
  onRequestReply?: () => void;
};

type ThreadStats = {
  contactName: string | null;
  installationCount: number | null;
  openTaskCount: number | null;
  ticketCount: number | null;
};

/**
 * Tab Copiloto (id `resumen`): veredicto completo, acción principal,
 * resumen del hilo con Continuar, más acciones IA y estado del hilo.
 */
export function CorreoWorkSummary({
  detail,
  readCursorAt,
  peekMode = false,
  onOpenAiLead,
  onAiCommand,
  onGoTo,
  onRequestReply,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const caps = useMemo(() => capsFromPerms(perms), [perms]);
  const canEditCorreos = canEdit(perms, "crm", "correos");

  const primary = useMemo(
    () =>
      resolvePrimaryCorreoAiCommand(t.aiCategory, t.aiVertical, caps, {
        canEditCorreos,
      }),
    [t.aiCategory, t.aiVertical, caps, canEditCorreos],
  );
  const secondary = useMemo(() => {
    const { primary: p, more } = resolveCorreoAiCommands(t.aiVertical, caps, {
      canEditCorreos,
    });
    return [...p, ...more].filter((c) => c.id !== primary?.id && c.kind === "panel");
  }, [t.aiVertical, caps, canEditCorreos, primary?.id]);

  const [stats, setStats] = useState<ThreadStats>({
    contactName: null,
    installationCount: null,
    openTaskCount: null,
    ticketCount: null,
  });
  const [primaryExecuted, setPrimaryExecuted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setPrimaryExecuted(false);
    setMoreOpen(false);
  }, [t.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [contactRes, linksRes, tasksRes] = await Promise.all([
        fetch(`/api/crm/correos/${t.id}/contact-context`).then((r) => r.json()).catch(() => null),
        fetch(`/api/crm/correos/${t.id}/links`).then((r) => r.json()).catch(() => null),
        fetch(`/api/crm/correos/${t.id}/tasks`).then((r) => r.json()).catch(() => null),
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
        openTaskCount: tasks.filter((t0: { status?: string }) => t0.status !== "done").length,
        ticketCount: tickets.length,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [t.id]);

  const primaryCopy = primary ? primaryActionCopy(t.aiCategory, primary.id) : null;

  function runCommand(id: CorreoAiCommandId) {
    if (primary && id === primary.id) setPrimaryExecuted(true);
    if (id === "lead") {
      onOpenAiLead();
      return;
    }
    onAiCommand?.(id);
  }

  const continueActions = useMemo(
    () =>
      resolveContinueActions({
        primaryTitle: primaryCopy?.title ?? null,
        primaryExecuted,
        lastReadAt: readCursorAt,
        messages: detail.messages,
        dealFechaEntrega: t.dealFechaEntrega,
        attachments: detail.attachments,
        degraded: detail.degraded,
        accountId: t.accountId,
        canEdit: canEditCorreos,
      }),
    [
      primaryCopy?.title,
      primaryExecuted,
      readCursorAt,
      detail.messages,
      t.dealFechaEntrega,
      detail.attachments,
      detail.degraded,
      t.accountId,
      canEditCorreos,
    ],
  );

  const accountValue = t.accountId ? t.accountName?.trim() || "Cuenta" : "Sin cuenta";
  const dealValue = t.dealTitle?.trim() || null;
  const contactValue = stats.contactName;
  const attachmentsSaved = detail.attachments.filter((a) => a.savedFileId).length;
  const attachmentsPending = detail.attachments.filter((a) => !a.savedFileId).length;
  const attachmentsValue =
    detail.attachments.length > 0
      ? attachmentsSaved > 0
        ? `${detail.attachments.length} · ${attachmentsSaved} guardado${attachmentsSaved === 1 ? "" : "s"}`
        : String(detail.attachments.length)
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

  const accountActionable = !t.accountId;
  const vinculosActionable =
    stats.installationCount != null && stats.installationCount === 0;
  const adjuntosActionable = !detail.degraded && attachmentsPending > 0;

  return (
    <div className="ds-page-enter space-y-3">
      <CorreoVerdictStrip
        variant="full"
        data={{
          aiCategory: t.aiCategory,
          aiSummary: t.aiSummary,
          aiUrgency: t.aiUrgency,
          aiClassifiedAt: t.aiClassifiedAt,
          lastMessageAt: t.lastMessageAt,
          dealFechaEntrega: t.dealFechaEntrega,
        }}
      />

      {primary && primaryCopy && !primaryExecuted && (
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

      <CorreoThreadSummaryCard
        threadId={t.id}
        initialSummary={t.threadSummary}
        lastReadAt={readCursorAt}
        messageCount={detail.messages.length}
        continueActions={continueActions}
        compact={compact}
        onAction={(id) => {
          if (id === "primary" && primary) {
            runCommand(primary.id);
            return;
          }
          if (id === "deadline") {
            onGoTo("productividad");
            return;
          }
          if (id === "attachments") {
            onGoTo("vinculos");
            return;
          }
          if (id === "associate") {
            onGoTo("cuenta");
            return;
          }
          if (id === "reply") {
            onRequestReply?.();
          }
        }}
      />

      {!peekMode && secondary.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-ds-border-subtle bg-ds-surface-2">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left ds-tap"
          >
            <Sparkles className="h-4 w-4 text-tint-violet-fg" />
            <span className="text-[13px] font-medium text-ds-text-1">Más acciones IA</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 text-ds-text-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>
          {moreOpen && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
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
        </div>
      )}

      {!peekMode && (
        <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-2">
          <p className="px-3 pt-2 text-[12px] font-medium text-ds-text-3">Estado del hilo</p>
          <StatusRow
            icon={Building2}
            label="Cuenta"
            value={dealValue ? `${accountValue} · ${dealValue}` : accountValue}
            actionable={accountActionable}
            onClick={() => onGoTo("cuenta")}
          />
          {contactValue && (
            <StatusRow
              icon={UserPlus}
              label="Contacto"
              value={contactValue}
              onClick={() => onGoTo("cuenta")}
            />
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
            actionable={vinculosActionable}
            onClick={() => onGoTo("vinculos")}
          />
          {attachmentsValue != null && (
            <StatusRow
              icon={Paperclip}
              label="Adjuntos"
              value={attachmentsValue}
              actionable={adjuntosActionable}
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
      )}
    </div>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
  onClick,
  actionable = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
  actionable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left ds-tap hover:bg-ds-surface-3"
    >
      <Icon className="h-4 w-4 shrink-0 text-ds-text-3" />
      <span className="text-[13px] font-medium text-ds-text-1">{label}</span>
      <span
        className={`ml-auto truncate text-[12px] ${
          actionable ? "text-status-warn-fg" : "text-ds-text-3"
        }`}
      >
        {value}
      </span>
      {actionable ? (
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-status-warn-border bg-status-warn-soft text-status-warn-fg"
          aria-hidden
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
      )}
    </button>
  );
}
