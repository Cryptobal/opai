"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ExternalLink,
  Circle,
  MessageSquare,
  Trash2,
  Loader2,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  link?: string | null;
  createdAt: string;
  sourceModule?: string;
  source_module?: string;
  sourceModuleLabel?: string;
  source_module_label?: string;
  sourceRecordName?: string | null;
  source_record_name?: string | null;
  isSystem?: boolean;
  is_system?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  new_lead: "🔔",
  lead_approved: "✅",
  quote_sent: "📧",
  quote_viewed: "👁️",
  contract_required: "📝",
  contract_expiring: "⚠️",
  contract_expired: "🔴",
  guardia_doc_expiring: "🟠",
  guardia_doc_expired: "🔴",
  new_postulacion: "📋",
  document_signed_completed: "✅",
  email_opened: "👀",
  email_clicked: "🖱️",
  email_bounced: "⚠️",
  followup_sent: "📨",
  followup_scheduled: "⏰",
  followup_failed: "❌",
  mention: "💬",
  ticket_created: "🎫",
  ticket_approved: "✅",
  ticket_rejected: "❌",
  ticket_sla_breached: "🚨",
  ticket_sla_approaching: "⏳",
  refuerzo_solicitud_created: "📋",
};

const TYPE_LABELS: Record<string, string> = {
  mention: "Mención",
};

type NotificationFilter = "all";
const FILTER_TO_TYPES: Record<NotificationFilter, string[]> = {
  all: [],
};

const NON_SYSTEM_TYPES = new Set([
  "mention",
  "ticket_mention",
]);

const TYPE_MODULE_FALLBACK: Record<string, string> = {
  new_lead: "lead",
  lead_approved: "lead",
  mention: "crm",
  email_opened: "negocio",
  email_clicked: "negocio",
  email_bounced: "negocio",
  followup_sent: "negocio",
  followup_scheduled: "negocio",
  followup_failed: "negocio",
  quote_sent: "cotizacion",
  quote_viewed: "cotizacion",
  contract_required: "contrato",
  contract_expiring: "contrato",
  contract_expired: "contrato",
  document_signed_completed: "contrato",
  guardia_doc_expiring: "guardia",
  guardia_doc_expired: "guardia",
  new_postulacion: "guardia",
  refuerzo_solicitud_created: "operaciones",
  ticket_created: "operaciones",
  ticket_approved: "operaciones",
  ticket_rejected: "operaciones",
  ticket_sla_breached: "operaciones",
  ticket_sla_approaching: "operaciones",
  ticket_mention: "operaciones",
};

const MODULE_LABELS: Record<string, string> = {
  lead: "Lead",
  negocio: "Negocio",
  cotizacion: "Cotización",
  contrato: "Contrato",
  operaciones: "Operaciones",
  guardia: "Guardia",
  cuenta: "Cuenta",
  contacto: "Contacto",
  instalacion: "Instalación",
  documentos: "Documentos",
  crm: "CRM",
  finanzas: "Finanzas",
  payroll: "Payroll",
  configuracion: "Configuración",
  hub: "Hub",
  sistema: "Sistema",
};

const MODULE_BADGE_STYLES: Record<string, string> = {
  lead: "border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  negocio: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cotizacion: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  contrato: "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  operaciones: "border-indigo-400/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  guardia: "border-orange-400/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  cuenta: "border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  contacto: "border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  instalacion: "border-teal-400/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  documentos: "border-yellow-400/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  crm: "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  finanzas: "border-lime-400/40 bg-lime-500/10 text-lime-700 dark:text-lime-300",
  payroll: "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  configuracion: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  hub: "border-purple-400/40 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  sistema: "border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

const MODULE_SORT_ORDER = [
  "lead",
  "negocio",
  "cotizacion",
  "contrato",
  "operaciones",
  "guardia",
  "cuenta",
  "contacto",
  "instalacion",
  "crm",
  "documentos",
  "finanzas",
  "payroll",
  "configuracion",
  "hub",
  "sistema",
];

type ThreadContext = {
  root: {
    id: string;
    content: string;
    author?: { name?: string };
    entityType: string;
    entityId: string;
  };
  replies: Array<{
    id: string;
    content: string;
    author?: { name?: string };
  }>;
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
}

function formatExactDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeModuleKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function inferModuleFromType(type: string): string {
  return TYPE_MODULE_FALLBACK[type] || "sistema";
}

function getModuleMeta(notification: NotificationItem) {
  const key =
    normalizeModuleKey(notification.sourceModule) ||
    normalizeModuleKey(notification.source_module) ||
    inferModuleFromType(notification.type);
  const label =
    notification.sourceModuleLabel ||
    notification.source_module_label ||
    MODULE_LABELS[key] ||
    "Sistema";

  return {
    key,
    label,
    badgeClass: MODULE_BADGE_STYLES[key] || MODULE_BADGE_STYLES.sistema,
  };
}

function getRecordName(notification: NotificationItem): string | null {
  const sourceRecord =
    notification.sourceRecordName ||
    notification.source_record_name ||
    null;
  if (sourceRecord) return sourceRecord;
  const data = (notification.data || {}) as Record<string, unknown>;
  const accountName = data.accountName;
  if (typeof accountName === "string" && accountName.trim()) return accountName.trim();
  const company = data.company;
  if (typeof company === "string" && company.trim()) return company.trim();
  const dealTitle = data.dealTitle;
  if (typeof dealTitle === "string" && dealTitle.trim()) return dealTitle.trim();
  return null;
}

function getContextLabel(notification: NotificationItem): string {
  const moduleMeta = getModuleMeta(notification);
  const recordName = getRecordName(notification);
  return recordName ? `${moduleMeta.label}: ${recordName}` : moduleMeta.label;
}

function isSystemNotification(notification: NotificationItem): boolean {
  if (typeof notification.isSystem === "boolean") return notification.isSystem;
  if (typeof notification.is_system === "boolean") return notification.is_system;
  return !NON_SYSTEM_TYPES.has(notification.type);
}

/**
 * Lista completa de notificaciones del usuario.
 * Todos los usuarios del hub pueden ver sus notificaciones, con links y marcar como leídas.
 */
export function NotificationListClient() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NotificationItem | null>(null);
  const [threadContext, setThreadContext] = useState<ThreadContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const selectedTypes = FILTER_TO_TYPES[filter];
      const params = new URLSearchParams({ limit: "50" });
      if (selectedTypes.length > 0) {
        params.set("types", selectedTypes.join(","));
      }
      const res = await fetch(`/api/notifications?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data || []);
        setUnreadCount(json.meta?.unreadCount ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setActionLoading(false);
    }
  };

  const setOneReadState = async (id: string, read: boolean) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], read }),
      });
      const previous = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
      if (!previous) return;
      if (!previous.read && read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else if (previous.read && !read) {
        setUnreadCount((prev) => prev + 1);
      }
    } catch {
      // silent
    }
  };

  const deleteAll = async () => {
    setActionLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteOne = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const removed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (removed && !removed.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // silent
    }
  };

  const handleClick = (n: NotificationItem) => {
    if (!n.read) void setOneReadState(n.id, true);
    if (n.link) {
      router.push(n.link);
    }
  };

  const getNotePayload = (n: NotificationItem) => {
    const data = (n.data || {}) as Record<string, unknown>;
    return {
      noteId: (data.replyNoteId as string) || (data.noteId as string) || (data.rootNoteId as string) || "",
      rootNoteId: (data.rootNoteId as string) || (data.noteId as string) || "",
      entityType: (data.entityType as string) || "",
      entityId: (data.entityId as string) || "",
    };
  };

  const canReplyInline = (n: NotificationItem) => {
    if (!["mention"].includes(n.type)) return false;
    const payload = getNotePayload(n);
    return Boolean(payload.noteId && payload.entityType && payload.entityId);
  };

  const openReplyModal = async (n: NotificationItem) => {
    const payload = getNotePayload(n);
    if (!payload.noteId) return;
    setReplyTarget(n);
    setReplyModalOpen(true);
    setReplyText("");
    setReplyFeedback(null);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "No se pudo cargar el hilo");
      setThreadContext(data.data as ThreadContext);
    } catch (error) {
      setThreadContext(null);
      const msg = error instanceof Error ? error.message : "No se pudo cargar el hilo";
      console.error(msg);
    } finally {
      setLoadingThread(false);
    }
  };

  const submitInlineReply = async () => {
    if (!replyTarget || !replyText.trim()) return;
    const payload = getNotePayload(replyTarget);
    const rootId = payload.rootNoteId || payload.noteId;
    setSendingReply(true);
    setReplyFeedback(null);
    try {
      const res = await fetch("/api/crm/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: payload.entityType,
          entityId: payload.entityId,
          parentId: rootId,
          content: replyText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error || "No se pudo responder");
      if (!replyTarget.read) {
        await setOneReadState(replyTarget.id, true);
      }
      setReplyText("");
      setReplyFeedback("Respuesta enviada. Contexto actualizado.");

      const refreshedThread = await fetch(`/api/crm/notes/thread?noteId=${payload.noteId}`);
      const refreshedData = await refreshedThread.json();
      if (refreshedThread.ok && refreshedData.success) {
        setThreadContext(refreshedData.data as ThreadContext);
      }

      await fetchNotifications();
    } catch (error) {
      console.error("No se pudo enviar respuesta inline", error);
      setReplyFeedback("No se pudo enviar la respuesta. Intenta nuevamente.");
    } finally {
      setSendingReply(false);
    }
  };

  const moduleOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const notification of notifications) {
      const moduleMeta = getModuleMeta(notification);
      unique.set(moduleMeta.key, moduleMeta.label);
    }
    const sorted = Array.from(unique.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => {
        const idxA = MODULE_SORT_ORDER.indexOf(a.key);
        const idxB = MODULE_SORT_ORDER.indexOf(b.key);
        if (idxA === -1 && idxB === -1) return a.label.localeCompare(b.label, "es");
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    return [{ key: "all", label: "Todos los módulos" }, ...sorted];
  }, [notifications]);

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (moduleFilter === "all") return true;
        return getModuleMeta(notification).key === moduleFilter;
      }),
    [notifications, moduleFilter]
  );

  const visibleUnreadCount = filteredNotifications.filter((n) => !n.read).length;
  const activeUnreadCount = moduleFilter === "all" ? unreadCount : visibleUnreadCount;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Tus notificaciones</h3>
            <p className="text-sm text-muted-foreground">
              {activeUnreadCount > 0
                ? `${activeUnreadCount} sin leer`
                : "Todas leídas"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeUnreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                disabled={actionLoading}
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Marcar todas leídas</span>
                <span className="sm:hidden">Leídas</span>
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={deleteAll}
                disabled={actionLoading}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Eliminar todas</span>
                <span className="sm:hidden">Eliminar</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              Todas
            </Button>
          </div>

          <div className="hidden md:flex flex-wrap items-center gap-2">
            {moduleOptions.map((moduleOption) => (
              <Button
                key={moduleOption.key}
                size="sm"
                variant={moduleFilter === moduleOption.key ? "default" : "outline"}
                onClick={() => setModuleFilter(moduleOption.key)}
              >
                {moduleOption.label}
              </Button>
            ))}
          </div>

          <div className="md:hidden">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Filtrar módulo" />
              </SelectTrigger>
              <SelectContent>
                {moduleOptions.map((moduleOption) => (
                  <SelectItem key={moduleOption.key} value={moduleOption.key}>
                    {moduleOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No hay notificaciones para este filtro</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredNotifications.map((n, index) => {
              const moduleMeta = getModuleMeta(n);
              const contextLabel = getContextLabel(n);
              const isSystem = isSystemNotification(n);
              const shouldShowSeparator =
                moduleFilter === "all" &&
                index > 0 &&
                getModuleMeta(filteredNotifications[index - 1]).key !== moduleMeta.key;

              return (
                <div key={n.id}>
                  {shouldShowSeparator && (
                    <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {moduleMeta.label}
                    </div>
                  )}
                  <div
                    className={cn(
                      "group flex items-start gap-3 py-3 hover:bg-accent/50 transition-colors -mx-2 px-2 rounded",
                      !n.read && "bg-primary/5",
                      isSystem && "border-l-2 border-amber-500/30 bg-amber-500/[0.04]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void setOneReadState(n.id, !n.read);
                      }}
                      className="shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title={n.read ? "Marcar como no leída" : "Marcar como leída"}
                    >
                      {n.read ? (
                        <CheckCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <span className="text-lg shrink-0 mt-0.5">
                      {TYPE_ICONS[n.type] || "📌"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => handleClick(n)}
                      >
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm truncate ${
                              !n.read ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        {n.message && (
                          <p className="text-sm leading-5 text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              moduleMeta.badgeClass
                            )}
                            title={contextLabel}
                          >
                            <span className="truncate max-w-[260px]">{contextLabel}</span>
                          </span>
                          {TYPE_LABELS[n.type] && (
                            <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {TYPE_LABELS[n.type]}
                            </span>
                          )}
                          {isSystem && (
                            <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Sistema
                            </span>
                          )}
                        </div>
                        <time
                          className="block text-[10px] text-muted-foreground/70 mt-1"
                          dateTime={n.createdAt}
                          title={formatExactDate(n.createdAt)}
                        >
                          {timeAgo(n.createdAt)}
                        </time>
                      </button>
                      {(n.type === "followup_sent" || n.type === "email_opened") &&
                        (n.data as { whatsappUrl?: string })?.whatsappUrl && (
                          <a
                            href={(n.data as { whatsappUrl: string }).whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Enviar WhatsApp
                          </a>
                        )}
                      {canReplyInline(n) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openReplyModal(n);
                          }}
                          className="inline-flex max-w-full items-center gap-1.5 mt-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                        >
                          <Reply className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[250px]">
                            {`Responder en ${contextLabel}`}
                          </span>
                        </button>
                      )}
                      {!canReplyInline(n) && n.link && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClick(n);
                          }}
                          className="inline-flex max-w-full items-center gap-1.5 mt-2 rounded-full bg-muted border border-border px-3 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[250px]">
                            {`Ir a ${contextLabel}`}
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1 mt-0.5">
                      {n.link && (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteOne(n.id);
                        }}
                        className="rounded p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={replyModalOpen} onOpenChange={setReplyModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Responder desde notificaciones</DialogTitle>
            <DialogDescription>
              Responde sin salir del módulo y conserva el contexto del hilo.
            </DialogDescription>
          </DialogHeader>

          {loadingThread ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : threadContext ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Nota original{threadContext.root.author?.name ? ` · ${threadContext.root.author.name}` : ""}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{threadContext.root.content}</p>
              </div>
              {threadContext.replies.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border-l border-border pl-3">
                  {threadContext.replies.map((reply) => (
                    <div key={reply.id} className="rounded-md border border-border/40 bg-card p-2">
                      <p className="text-[11px] text-muted-foreground">
                        {reply.author?.name || "Usuario"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Escribe tu respuesta..."
                className="w-full min-h-[90px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {replyFeedback && (
                <p className="text-xs text-muted-foreground">{replyFeedback}</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No se pudo cargar el contexto del hilo.
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReplyModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitInlineReply} disabled={!replyText.trim() || sendingReply || loadingThread || !threadContext}>
              {sendingReply && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar respuesta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
