"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellOff,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Pause,
  Pencil,
  Plane,
  Play,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import { isAdminRole } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type Ticket,
  type TicketComment,
  type TicketStatus,
  type SlaExtensionEntry,
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_TEAM_CONFIG,
  TICKET_SOURCE_CONFIG,
  getSlaRemaining,
  getSlaPercentage,
  getSlaColor,
  getSlaTextColor,
  isSlaBreached,
  canTransitionTo,
  isPendingMyApproval,
} from "@/lib/tickets";
import { TicketApprovalTimeline } from "./TicketApprovalTimeline";
import { TicketFindingCard } from "./TicketFindingCard";
import { SlaBar } from "./TicketsClient";
import {
  useReplyTemplates,
  renderTemplate,
  type ReplyTemplate,
  type RenderContext,
} from "./useReplyTemplates";

interface TicketDetailClientProps {
  ticketId: string;
  userRole: string;
  userId: string;
  userGroupIds: string[];
}

interface TicketEvent {
  id: string;
  ticketId: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  data: unknown;
  createdAt: string;
}

export function TicketDetailClient({ ticketId, userRole, userId, userGroupIds }: TicketDetailClientProps) {
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Assignee state
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [assigningUser, setAssigningUser] = useState(false);

  // Mention autocomplete state
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // SLA controls state
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [extendLoading, setExtendLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [showPauseReason, setShowPauseReason] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [snoozeLoading, setSnoozeLoading] = useState(false);
  const [showSlaHistory, setShowSlaHistory] = useState(false);

  // Composer mode
  const [composerMode, setComposerMode] = useState<"internal" | "email">("internal");

  // Status transition menu
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketRes, commentsRes, eventsRes] = await Promise.all([
        fetch(`/api/ops/tickets/${ticketId}`),
        fetch(`/api/ops/tickets/${ticketId}/comments`),
        fetch(`/api/ops/tickets/${ticketId}/events`),
      ]);
      const ticketData = await ticketRes.json();
      const commentsData = await commentsRes.json();
      // Eventos opcionales: si la tabla aún no fue migrada en algún
      // ambiente, el endpoint puede devolver 404/500. No se cae el flujo.
      const eventsData = eventsRes.ok ? await eventsRes.json() : null;
      if (ticketData.success) setTicket(ticketData.data);
      if (commentsData.success) setComments(commentsData.data.items);
      if (eventsData?.success) setEvents(eventsData.data.items);
      else setEvents([]);
    } catch {
      toast.error("Error al cargar ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  // Tick cada 30s para re-renderizar el countdown de SLA y el flag
  // `breached` mientras el ticket sigue activo. No re-fetch: solo Date.now()
  // recalcula los derivados de slaDueAt/resolvedAt.
  const [, setSlaTick] = useState(0);
  useEffect(() => {
    if (!ticket) return;
    const isTerminal = ["resolved", "closed", "rejected", "cancelled"].includes(
      ticket.status,
    );
    if (isTerminal) return;
    const id = setInterval(() => setSlaTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [ticket?.id, ticket?.status]);

  // Fetch admins and groups for @mention and assignee
  useEffect(() => {
    fetch("/api/ops/admins")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setAvailableUsers(
            d.data.map((u: { id: string; name: string | null; email: string }) => ({
              id: u.id,
              name: u.name || u.email,
            })),
          );
        }
      })
      .catch(() => {});

    fetch("/api/ops/groups")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data)) {
          setAvailableGroups(
            d.data.map((g: { id: string; name: string }) => ({
              id: g.id,
              name: g.name,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Optimistic status transition
  async function handleTransition(newStatus: TicketStatus) {
    if (!ticket) return;
    const prevTicket = ticket;
    // Optimistic update
    setTicket((prev) => prev ? { ...prev, status: newStatus } : null);
    setTransitioning(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.data) setTicket(data.data);
      toast.success(`Estado: "${TICKET_STATUS_CONFIG[newStatus].label}"`);
    } catch {
      setTicket(prevTicket); // revert
      toast.error("Error al cambiar estado");
    } finally {
      setTransitioning(false);
    }
  }

  // Optimistic comment
  async function handleAddComment() {
    if (!newComment.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const tempComment: TicketComment = {
      id: tempId,
      ticketId,
      userId,
      userName: "Tú",
      body: newComment.trim(),
      isInternal: false,
      direction: "internal",
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, tempComment]);
    setNewComment("");
    setSendingComment(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: tempComment.body }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.data) {
        setComments((prev) => prev.map((c) => (c.id === tempId ? data.data : c)));
      }
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      toast.error("Error al agregar comentario");
    } finally {
      setSendingComment(false);
    }
  }

  // Editar comentario existente. Optimistic update con rollback en caso de error.
  async function handleEditComment(commentId: string, newBody: string) {
    const trimmed = newBody.trim();
    if (!trimmed) return;
    const prevComments = comments;
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, body: trimmed, updatedAt: new Date().toISOString() }
          : c,
      ),
    );
    try {
      const res = await fetch(
        `/api/ops/tickets/${ticketId}/comments/${commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.data) {
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? data.data : c)),
        );
      }
      toast.success("Comentario editado");
    } catch (err) {
      setComments(prevComments);
      toast.error(err instanceof Error ? err.message : "Error al editar comentario");
    }
  }

  // Eliminar comentario. Optimistic remove con rollback en caso de error.
  async function handleDeleteComment(commentId: string) {
    const prevComments = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      const res = await fetch(
        `/api/ops/tickets/${ticketId}/comments/${commentId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Comentario eliminado");
    } catch (err) {
      setComments(prevComments);
      toast.error(err instanceof Error ? err.message : "Error al eliminar comentario");
    }
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setNewComment(value);
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex >= 0) {
      const afterAt = value.slice(lastAtIndex + 1);
      // Mostrar dropdown solo cuando se empieza a tipear (>= 1 char) para
      // evitar abrir un menú intrusivo apenas se escribe `@`. La búsqueda
      // por prefijo de palabra hace el match consistente con el backend.
      if (
        afterAt.length >= 1 &&
        !afterAt.includes("  ") &&
        afterAt.split(" ").length <= 2
      ) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentionList(true);
        return;
      }
    }
    setShowMentionList(false);
  }

  // Match de UI consistente con el backend:
  //  - Grupos: match exacto (case insensitive).
  //  - Usuarios: prefijo de alguna palabra del nombre.
  // Si más adelante se quiere un fallback a substring, hay que ajustar
  // también el backend para no abrir el spam por substring.
  function matchMentionGroup(name: string, filter: string): boolean {
    return name.toLowerCase() === filter;
  }
  function matchMentionUser(name: string, filter: string): boolean {
    if (!filter) return true;
    return name
      .toLowerCase()
      .split(/\s+/)
      .some((w) => w.startsWith(filter));
  }

  function insertMention(userName: string) {
    const lastAtIndex = newComment.lastIndexOf("@");
    if (lastAtIndex >= 0) {
      setNewComment(newComment.slice(0, lastAtIndex) + `@${userName} `);
    }
    setShowMentionList(false);
  }

  // Assign user
  async function handleAssignUser(targetUserId: string) {
    if (!ticket) return;
    const prevTicket = ticket;
    const user = availableUsers.find((u) => u.id === targetUserId);
    // Optimistic
    setTicket((prev) => prev ? { ...prev, assignedTo: targetUserId, assignedToName: user?.name ?? null } : null);
    setAssigningUser(false);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: targetUserId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(`Asignado a ${user?.name ?? "usuario"}`);
    } catch {
      setTicket(prevTicket);
      toast.error("Error al asignar responsable");
    }
  }

  async function handleApproveTicket(approvalId: string, comment?: string) {
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, action: "approve", comment: comment ?? null }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Aprobación registrada");
      fetchTicket();
    } catch {
      toast.error("Error al aprobar");
    }
  }

  async function handleRejectTicket(approvalId: string, comment: string) {
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, action: "reject", comment }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Rechazo registrado");
      fetchTicket();
    } catch {
      toast.error("Error al rechazar");
    }
  }

  const canDelete =
    userRole === "owner" || userRole === "admin" || (ticket && ticket.reportedBy === userId);

  async function handleDeleteTicket() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Ticket eliminado");
      router.push("/ops/tickets");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar ticket");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── SLA Extend ──
  async function handleExtendSla() {
    if (!extendDate || !extendReason.trim()) return;
    setExtendLoading(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slaDueAt: new Date(extendDate).toISOString(), slaExtensionReason: extendReason.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTicket(data.data);
      setShowExtendModal(false);
      setExtendDate("");
      setExtendReason("");
      toast.success("SLA aplazado");
      fetchTicket(); // refresh comments
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al aplazar SLA");
    } finally {
      setExtendLoading(false);
    }
  }

  // ── SLA Pause / Resume ──
  async function handleTogglePause() {
    if (!ticket) return;
    const isPaused = !!ticket.slaPausedAt;
    if (!isPaused && !showPauseReason) {
      setShowPauseReason(true);
      return;
    }
    setPauseLoading(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slaPaused: !isPaused,
          slaPausedReason: !isPaused ? pauseReason.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTicket(data.data);
      setShowPauseReason(false);
      setPauseReason("");
      toast.success(isPaused ? "SLA reanudado" : "SLA pausado");
      fetchTicket();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al pausar/reanudar SLA");
    } finally {
      setPauseLoading(false);
    }
  }

  // ── Snooze ──
  async function handleSnooze(hours?: number, untilDate?: Date) {
    setSnoozeLoading(true);
    try {
      let snoozedUntil: string | null = null;
      if (hours !== undefined) {
        snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      } else if (untilDate) {
        snoozedUntil = untilDate.toISOString();
      }
      const res = await fetch(`/api/ops/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozedUntil }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTicket(data.data);
      setShowSnoozeMenu(false);
      toast.success(snoozedUntil ? "Avisos silenciados" : "Silenciamiento removido");
      fetchTicket();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al silenciar avisos");
    } finally {
      setSnoozeLoading(false);
    }
  }

  function getTomorrow9am(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => router.push("/ops")}
            className="hover:text-foreground transition-colors"
          >
            Operaciones
          </button>
          <ChevronRight className="h-3 w-3" />
          <button
            type="button"
            onClick={() => router.push("/ops/tickets")}
            className="hover:text-foreground transition-colors"
          >
            Tickets
          </button>
        </nav>
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Ticket no encontrado.</p>
        </div>
      </div>
    );
  }

  const statusCfg = TICKET_STATUS_CONFIG[ticket.status];
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const teamCfg = TICKET_TEAM_CONFIG[ticket.assignedTeam];
  const sourceCfg = TICKET_SOURCE_CONFIG[ticket.source];
  const slaText = getSlaRemaining(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const breached = isSlaBreached(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const isTerminal = ["resolved", "closed", "rejected", "cancelled"].includes(ticket.status);

  const availableTransitions = (Object.keys(TICKET_STATUS_CONFIG) as TicketStatus[]).filter(
    (s) => canTransitionTo(ticket.status, s),
  );

  return (
    <div className="space-y-3 pb-24">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => router.push("/ops")}
          className="hover:text-foreground transition-colors"
        >
          Operaciones
        </button>
        <ChevronRight className="h-3 w-3" />
        <button
          type="button"
          onClick={() => router.push("/ops/tickets")}
          className="hover:text-foreground transition-colors"
        >
          Tickets
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{ticket.code}</span>
      </nav>

      {/* ── CARD: Header ── */}
      <div className={`rounded-xl border bg-ds-surface-1 p-4 space-y-3 ${breached && !isTerminal ? "border-status-danger-border" : "border-border"}`}>
        {/* Row 1: Code + Status + Priority + Delete */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">{ticket.code}</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => availableTransitions.length > 0 && setShowStatusMenu(!showStatusMenu)}
              disabled={availableTransitions.length === 0 || transitioning}
              className={`${availableTransitions.length > 0 ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            >
              <Badge variant={statusCfg.variant} className="gap-1">
                {statusCfg.label}
                {availableTransitions.length > 0 && <ChevronRight className="h-3 w-3 rotate-90" />}
              </Badge>
            </button>
            {showStatusMenu && availableTransitions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-xl border border-border bg-popover shadow-md">
                {availableTransitions.map((status) => {
                  const cfg = TICKET_STATUS_CONFIG[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      disabled={transitioning}
                      onClick={() => {
                        setShowStatusMenu(false);
                        handleTransition(status);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span className={`text-xs font-semibold ${priorityCfg.color}`}>
            {ticket.priority.toUpperCase()}
          </span>
          {breached && !isTerminal && (
            <Badge variant="destructive" className="gap-0.5 text-[12px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              SLA vencido
            </Badge>
          )}
          {ticket.slaPausedAt && (
            <Badge variant="secondary" className="gap-0.5 text-[12px] bg-status-warn-soft text-status-warn-fg border-status-warn-border">
              <Pause className="h-2.5 w-2.5" />
              SLA pausado
            </Badge>
          )}
          {ticket.snoozedUntil && new Date(ticket.snoozedUntil) > new Date() && (
            <Badge variant="secondary" className="gap-0.5 text-[12px] bg-status-info-soft text-status-info-fg border-status-info-border">
              <BellOff className="h-2.5 w-2.5" />
              Silenciado hasta {new Date(ticket.snoozedUntil).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Badge>
          )}
          {canDelete && (
            <div className="ml-auto">
              <Button
                variant={confirmDelete ? "destructive" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={deleting}
                onClick={handleDeleteTicket}
                onBlur={() => setConfirmDelete(false)}
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                {confirmDelete ? "Confirmar" : ""}
              </Button>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-base font-semibold leading-snug">{ticket.title}</h2>

        {/* Tags */}
        {ticket.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {ticket.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Guard badge */}
        {ticket.guardiaName && (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Guardia asociado
            </p>
            <button
              type="button"
              onClick={() => {
                if (ticket.guardiaId) router.push(`/personas/guardias/${ticket.guardiaId}`);
              }}
              className="flex items-center gap-2 rounded-lg bg-status-info-soft px-3 py-2 transition-colors hover:bg-status-info-soft"
            >
              <Shield className="h-4 w-4 text-status-info-fg" />
              <div className="text-left">
                <p className="text-sm font-medium text-status-info-fg">{ticket.guardiaName}</p>
                <p className="text-[12px] text-status-info-fg/60">
                  {[ticket.guardiaRut, ticket.guardiaCode].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-status-info-fg/50" />
            </button>
          </div>
        )}

        {/* Responsible */}
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Responsable
          </p>
          {assigningUser ? (
            <div className="space-y-2">
              <Select
                value=""
                onValueChange={(v) => {
                  if (v) handleAssignUser(v);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Seleccionar responsable..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAssigningUser(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : ticket.assignedToName ? (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[12px] font-semibold text-primary">
                {ticket.assignedToName
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </div>
              <span className="text-sm font-medium">{ticket.assignedToName}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground ml-auto"
                onClick={() => setAssigningUser(true)}
              >
                Reasignar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAssigningUser(true)}
              className="flex items-center gap-2 rounded-lg border border-status-warn-border bg-status-warn-soft/30 px-3 py-2 text-sm text-status-warn-fg transition-colors hover:bg-status-warn-soft"
            >
              <UserCircle className="h-4 w-4" />
              <span className="font-medium">Sin asignar</span>
              <span className="text-xs text-status-warn-fg/60 ml-auto">Asignar</span>
            </button>
          )}
        </div>

        {/* Info grid — 2 columns */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <InfoField label="Tipo" value={ticket.ticketType?.name ?? "—"} />
          <InfoField label="Equipo" value={teamCfg?.label ?? ticket.assignedTeam} />
          <InfoField label="Origen" value={sourceCfg?.label ?? ticket.source} />
          <InfoField
            label="Creado"
            value={new Date(ticket.createdAt).toLocaleString("es-CL", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </div>

        {/* SLA Bar */}
        {ticket.slaDueAt && (
          <div className="pt-1">
            <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              SLA restante
            </p>
            <SlaBar
              slaDueAt={ticket.slaDueAt}
              createdAt={ticket.createdAt}
              status={ticket.status}
              resolvedAt={ticket.resolvedAt}
              live
            />
          </div>
        )}
      </div>

      {/* ── CARD: SLA Controls ── */}
      {ticket.slaDueAt && !isTerminal && (
        <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-3">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Controles SLA
          </p>
          {/* En mobile mantenemos los 3 botones en una sola fila usando
              flex-nowrap + min-w-0; los textos se truncan si hace falta. */}
          <div className="flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
            {/* Extend SLA */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-0 flex-1 px-2 text-xs gap-1 sm:flex-none sm:px-3"
              onClick={() => setShowExtendModal(true)}
            >
              <Calendar className="h-3 w-3 shrink-0" />
              <span className="truncate">Aplazar SLA</span>
            </Button>

            {/* Pause / Resume SLA */}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 min-w-0 flex-1 px-2 text-xs gap-1 sm:flex-none sm:px-3 ${ticket.slaPausedAt ? "border-status-warn-border text-status-warn-fg" : ""}`}
              disabled={pauseLoading}
              onClick={handleTogglePause}
            >
              {pauseLoading ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : ticket.slaPausedAt ? (
                <Play className="h-3 w-3 shrink-0" />
              ) : (
                <Pause className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{ticket.slaPausedAt ? "Reanudar SLA" : "Pausar SLA"}</span>
            </Button>

            {/* Snooze notifications */}
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full min-w-0 px-2 text-xs gap-1 sm:w-auto sm:px-3"
                onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              >
                <BellOff className="h-3 w-3 shrink-0" />
                <span className="truncate">Silenciar avisos</span>
              </Button>
              {showSnoozeMenu && (
                <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-xl border border-border bg-popover shadow-md">
                  {[
                    { label: "1 hora", hours: 1 },
                    { label: "4 horas", hours: 4 },
                    { label: "1 día", hours: 24 },
                    { label: "Hasta mañana 9am", hours: undefined, untilDate: getTomorrow9am() },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={snoozeLoading}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                      onClick={() => handleSnooze(opt.hours, opt.untilDate)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {ticket.snoozedUntil && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-status-danger-fg hover:bg-accent transition-colors rounded-b-xl border-t border-border"
                      onClick={() => handleSnooze(undefined, undefined)}
                    >
                      Quitar silenciamiento
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* SLA History */}
            {ticket.slaExtensions && ticket.slaExtensions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground"
                onClick={() => setShowSlaHistory(!showSlaHistory)}
              >
                <History className="h-3 w-3" />
                Historial ({ticket.slaExtensions.length})
              </Button>
            )}
          </div>

          {/* Pause reason input */}
          {showPauseReason && !ticket.slaPausedAt && (
            <div className="flex items-center gap-2">
              <Input
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="Motivo de pausa (opcional)"
                className="text-sm h-8 flex-1"
              />
              <Button size="sm" className="h-8 text-xs" disabled={pauseLoading} onClick={handleTogglePause}>
                {pauseLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pausar"}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowPauseReason(false)}>
                Cancelar
              </Button>
            </div>
          )}

          {/* Extend modal */}
          {showExtendModal && (
            <div className="space-y-2 rounded-lg border border-border p-3 bg-background/50">
              <p className="text-xs font-medium">Aplazar SLA</p>
              <input
                type="datetime-local"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                min={new Date().toISOString().slice(0, 16)}
              />
              <textarea
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
                placeholder="Motivo del aplazamiento (obligatorio)"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm min-h-[60px] resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" disabled={extendLoading || !extendDate || !extendReason.trim()} onClick={handleExtendSla}>
                  {extendLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aplazar"}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowExtendModal(false); setExtendDate(""); setExtendReason(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* SLA Extension History */}
          {showSlaHistory && ticket.slaExtensions && ticket.slaExtensions.length > 0 && (
            <div className="space-y-1 rounded-lg border border-border p-3 bg-background/50">
              <p className="text-xs font-medium mb-2">Historial de extensiones</p>
              {ticket.slaExtensions.map((ext, idx) => (
                <div key={idx} className="text-xs text-muted-foreground border-l-2 border-border pl-2 py-1">
                  <span className="text-foreground">
                    {new Date(ext.at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {" — "}
                  {ext.reason}
                  <br />
                  <span className="text-[12px]">
                    {ext.fromDueAt ? new Date(ext.fromDueAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    {" → "}
                    {new Date(ext.toDueAt).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CARD: Supervision finding (documento + guardia + visita) ── */}
      {ticket.finding && <TicketFindingCard finding={ticket.finding} />}

      {/* ── CARD: Description ── */}
      {ticket.description && (
        <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Descripción
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
        </div>
      )}

      {/* ── CARD: Approval chain ── */}
      {ticket.approvals && ticket.approvals.length > 0 && (
        <div className="rounded-xl border border-border bg-ds-surface-1 p-4">
          <TicketApprovalTimeline
            approvals={ticket.approvals}
            currentStep={ticket.currentApprovalStep}
            approvalStatus={ticket.approvalStatus}
            userGroupIds={userGroupIds}
            userId={userId}
            onApprove={handleApproveTicket}
            onReject={handleRejectTicket}
          />
        </div>
      )}

      {/* ── CARD: Resolution notes ── */}
      {ticket.resolutionNotes && (
        <div className="rounded-xl border border-status-ok-border bg-status-ok-soft p-4 space-y-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-status-ok-fg">
            Notas de resolución
          </p>
          <p className="text-sm whitespace-pre-wrap">{ticket.resolutionNotes}</p>
        </div>
      )}

      {/* ── CARD: Adjuntos del ticket ──
          Adjuntos persistidos a nivel de ticket (subir/ver/eliminar) +
          adjuntos heredados de los comentarios/emails. */}
      <TicketAttachmentsCard
        ticketId={ticketId}
        comments={comments}
        userId={userId}
        userRole={userRole}
      />

      {/* ── CARD: Tickets relacionados ── */}
      <TicketLinksCard ticketId={ticketId} ticketCode={ticket.code} />

      {/* ── CARD: Portal público (PIN) ── */}
      <TicketPublicPortalCard ticketId={ticketId} ticketCode={ticket.code} />

      {/* ── CARD: Encuesta CSAT (solo si el ticket está terminal) ── */}
      <TicketCsatCard ticketId={ticketId} status={ticket.status} />

      {/* ── CARD: Activity Timeline ── */}
      <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Actividad</h4>
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        </div>

        {/* Timeline — mezcla cronológica de comments + events.
            'ticket_created' del audit lo escondemos porque ya tenemos el
            TimelineEvent de "Creó el ticket" arriba. */}
        <div className="relative space-y-0">
          {(comments.length > 0 || events.length > 0) && (
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-border" />
          )}

          <TimelineEvent
            icon={<Check className="h-3 w-3" />}
            iconBg="bg-primary/20 text-primary"
            user={ticket.reportedByName ?? "Usuario"}
            time={ticket.createdAt}
            content="Creó el ticket"
          />

          {(() => {
            type Item =
              | { kind: "comment"; t: number; comment: TicketComment }
              | { kind: "event"; t: number; event: TicketEvent };
            const items: Item[] = [
              ...comments.map<Item>((c) => ({
                kind: "comment",
                t: new Date(c.createdAt).getTime(),
                comment: c,
              })),
              ...events
                .filter((e) => e.type !== "ticket_created")
                .map<Item>((e) => ({
                  kind: "event",
                  t: new Date(e.createdAt).getTime(),
                  event: e,
                })),
            ];
            items.sort((a, b) => a.t - b.t);
            return items.map((it) =>
              it.kind === "comment" ? (
                <EmailTimelineEvent
                  key={`c-${it.comment.id}`}
                  comment={it.comment}
                  isSending={it.comment.id.startsWith("temp-")}
                  currentUserId={userId}
                  currentUserRole={userRole}
                  onEdit={handleEditComment}
                  onDelete={handleDeleteComment}
                />
              ) : (
                <TicketAuditEvent key={`e-${it.event.id}`} event={it.event} />
              ),
            );
          })()}
        </div>

        {/* ── Composer ── */}
        <div className="pt-2 border-t border-border space-y-2">
          {/* Composer mode toggle */}
          <div className="flex gap-1">
            {(["internal", "email"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setComposerMode(m)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  composerMode === m
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "internal" ? "Nota interna" : "Responder por email"}
              </button>
            ))}
          </div>

          {composerMode === "email" ? (
            <EmailComposer
              ticketId={ticketId}
              ticket={ticket}
              comments={comments}
              onSent={() => fetchTicket()}
            />
          ) : (
            <div className="flex items-start gap-2">
              <div className="relative flex-1">
                {/* Plantillas (sobre el input para no romper el layout
                    flex). El menú es un popover absolutely-positioned. */}
                <div className="mb-1.5 flex items-center justify-end">
                  <ReplyTemplatesMenu
                    scope="internal"
                    align="end"
                    context={{
                      ticket: { code: ticket.code, title: ticket.title },
                      guardia: { nombre: ticket.guardiaName },
                      user: { nombre: ticket.assignedToName },
                    }}
                    onApply={(rendered) => {
                      const trimmed = rendered.trim();
                      if (!trimmed) return;
                      // Si ya hay texto, anteponemos un salto.
                      setNewComment((prev) =>
                        prev.trim() ? `${prev.trimEnd()}\n${trimmed}` : trimmed,
                      );
                    }}
                  />
                </div>
                <Input
                  value={newComment}
                  onChange={handleCommentChange}
                  placeholder="Agregar nota interna... (@ para mencionar)"
                  className="text-[16px] pr-10"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !showMentionList) {
                      e.preventDefault();
                      handleAddComment();
                    }
                    if (e.key === "Escape") setShowMentionList(false);
                  }}
                  onBlur={() => setTimeout(() => setShowMentionList(false), 200)}
                />
                {showMentionList && (
                  <div className="absolute bottom-full left-0 mb-1 w-full max-h-60 overflow-y-auto rounded-xl border border-border bg-popover shadow-md z-50">
                    {/* Groups first */}
                    {availableGroups
                      .filter((g) => matchMentionGroup(g.name, mentionFilter))
                      .slice(0, 4)
                      .map((g) => (
                        <button
                          key={`group-${g.id}`}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(g.name);
                          }}
                        >
                          <Users className="h-3 w-3 text-status-info-fg" />
                          <span>{g.name}</span>
                          <span className="text-[12px] text-muted-foreground ml-auto">grupo</span>
                        </button>
                      ))}
                    {availableGroups.filter((g) => matchMentionGroup(g.name, mentionFilter)).length > 0 && (
                      <div className="border-t border-border" />
                    )}
                    {/* Users */}
                    {availableUsers
                      .filter((u) => matchMentionUser(u.name, mentionFilter))
                      .slice(0, 8)
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center gap-2"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            insertMention(u.name);
                          }}
                        >
                          <User className="h-3 w-3 text-muted-foreground" />
                          {u.name}
                        </button>
                      ))}
                    {availableUsers.filter((u) => matchMentionUser(u.name, mentionFilter)).length === 0 &&
                     availableGroups.filter((g) => matchMentionGroup(g.name, mentionFilter)).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No se encontraron resultados</p>
                    )}
                  </div>
                )}
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={handleAddComment}
                disabled={!newComment.trim() || sendingComment}
                className="h-10 w-10 shrink-0 rounded-lg"
              >
                {sendingComment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TIMELINE EVENT (original, for non-email events)
// ═══════════════════════════════════════════════════════════════

function TimelineEvent({
  icon,
  iconBg,
  user,
  time,
  content,
}: {
  icon: React.ReactNode;
  iconBg: string;
  user: string;
  time: string;
  content: string;
}) {
  const timeStr = new Date(time).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative flex gap-3 py-2">
      <div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{user}</span>
          <span className="text-muted-foreground">{timeStr}</span>
        </div>
        <p className="mt-0.5 text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EMAIL TIMELINE EVENT (handles internal, email_out, email_in)
// ═══════════════════════════════════════════════════════════════

function EmailTimelineEvent({
  comment,
  isSending,
  currentUserId,
  currentUserRole,
  onEdit,
  onDelete,
}: {
  comment: TicketComment;
  isSending: boolean;
  currentUserId?: string;
  currentUserRole?: string;
  onEdit?: (commentId: string, newBody: string) => void | Promise<void>;
  onDelete?: (commentId: string) => void | Promise<void>;
}) {
  const [showHtml, setShowHtml] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState(comment.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dir = comment.direction ?? "internal";

  const timeStr = new Date(comment.createdAt).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Permisos de edición/borrado en cliente (la API es quien manda; esto solo
  // controla la visibilidad del menú).
  const isAuthor = currentUserId != null && comment.userId === currentUserId;
  const isAdmin = currentUserRole != null && isAdminRole(currentUserRole);
  const isEmailWire = dir === "email_in" || dir === "email_out";
  const isOptimistic = isSending || comment.id.startsWith("temp-");

  const canEditClient = !!onEdit && (isAuthor || isAdmin) && !isEmailWire && !isOptimistic;
  const canDeleteClient = !!onDelete && (isAuthor || isAdmin) && !isOptimistic;
  const showActionsButton = canEditClient || canDeleteClient;

  // Detecta edición previa: updatedAt > createdAt (con tolerancia de 2s para
  // jitter de DB).
  const wasEdited =
    comment.updatedAt &&
    new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 2000;

  function startEdit() {
    setEditBuffer(comment.body);
    setIsEditing(true);
    setShowActionsMenu(false);
  }

  function cancelEdit() {
    setEditBuffer(comment.body);
    setIsEditing(false);
  }

  async function saveEdit() {
    if (!onEdit) return;
    const trimmed = editBuffer.trim();
    if (!trimmed || trimmed === comment.body.trim()) {
      cancelEdit();
      return;
    }
    await onEdit(comment.id, trimmed);
    setIsEditing(false);
  }

  async function confirmDelete() {
    if (!onDelete) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      // Auto-reset después de 4s si no se confirma.
      setTimeout(() => setConfirmingDelete(false), 4000);
      return;
    }
    await onDelete(comment.id);
    setConfirmingDelete(false);
    setShowActionsMenu(false);
  }

  const dirConfig = {
    internal: {
      bg: comment.isInternal ? "bg-status-warn-soft border-status-warn-border" : "bg-transparent border-transparent",
      iconBg: comment.isInternal ? "bg-status-warn-soft text-status-warn-fg" : "bg-muted text-muted-foreground",
      icon: <User className="h-3 w-3" />,
      label: comment.isInternal ? "Nota interna" : null,
    },
    email_out: {
      bg: "bg-status-info-soft border-status-info-border",
      iconBg: "bg-status-info-soft text-status-info-fg",
      icon: <Plane className="h-3 w-3" />,
      label: "Email enviado",
    },
    email_in: {
      bg: "bg-zinc-500/5 border-zinc-500/20",
      iconBg: "bg-zinc-500/20 text-zinc-400",
      icon: <MailOpen className="h-3 w-3" />,
      label: "Email recibido",
    },
  };

  const cfg = dirConfig[dir as keyof typeof dirConfig] ?? dirConfig.internal;
  const atts = (comment.attachments ?? []) as Array<{ fileName: string; url?: string; r2Key?: string; size?: number }>;

  const deliveryColors: Record<string, string> = {
    sent: "text-status-info-fg",
    delivered: "text-status-ok-fg",
    failed: "text-status-danger-fg",
    bounced: "text-status-danger-fg",
  };

  return (
    <div className={`relative flex gap-3 py-2 ${isSending ? "opacity-60" : ""}`}>
      <div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${cfg.iconBg}`}>
        {cfg.icon}
      </div>

      <div className={`group/comment relative min-w-0 flex-1 rounded-lg border p-2 ${cfg.bg}`}>
        {/* Header row */}
        <div className="flex items-center gap-2 text-xs flex-wrap pr-7">
          <span className="font-medium">
            {dir === "email_in" ? (comment.fromName || comment.fromEmail || "Externo") : (comment.userName ?? "Usuario")}
          </span>
          <span className="text-muted-foreground">{timeStr}</span>
          {cfg.label && (
            <Badge variant="outline" className="text-[12px]">
              {cfg.label}
            </Badge>
          )}
          {wasEdited && (
            <span className="text-[12px] italic text-muted-foreground" title="Editado">
              · editado
            </span>
          )}
          {comment.deliveryStatus && (
            <span className={`text-[12px] font-medium ${deliveryColors[comment.deliveryStatus] ?? "text-muted-foreground"}`}>
              {comment.deliveryStatus === "sent" ? "Enviado" : comment.deliveryStatus === "delivered" ? "Entregado" : comment.deliveryStatus === "failed" ? "Falló" : comment.deliveryStatus}
            </span>
          )}
          {isSending && (
            <span className="text-[12px] text-muted-foreground italic">Enviando...</span>
          )}
        </div>

        {/* Acciones (editar / eliminar) — visible al hover en desktop, siempre
            tocable en mobile. Solo se muestra si el usuario tiene permisos. */}
        {showActionsButton && !isEditing && (
          <div className="absolute top-1.5 right-1.5">
            <button
              type="button"
              aria-label="Acciones del comentario"
              onClick={() => setShowActionsMenu((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:opacity-0 sm:group-hover/comment:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {showActionsMenu && (
              <>
                {/* Backdrop para cerrar al tocar fuera */}
                <button
                  type="button"
                  aria-label="Cerrar menú"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => {
                    setShowActionsMenu(false);
                    setConfirmingDelete(false);
                  }}
                />
                <div className="absolute right-0 top-8 z-50 min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-md">
                  {canEditClient && (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      Editar
                    </button>
                  )}
                  {canDeleteClient && (
                    <button
                      type="button"
                      onClick={confirmDelete}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        confirmingDelete
                          ? "bg-status-danger-soft text-status-danger-fg font-medium"
                          : "text-status-danger-fg hover:bg-status-danger-soft"
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {confirmingDelete ? "Confirmar eliminación" : "Eliminar"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Email addressing info */}
        {(dir === "email_out" || dir === "email_in") && (
          <div className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
            {dir === "email_in" && comment.fromEmail && (
              <p>De: <span className="text-foreground">{comment.fromEmail}</span></p>
            )}
            {comment.toEmails && comment.toEmails.length > 0 && (
              <p>Para: <span className="text-foreground">{comment.toEmails.join(", ")}</span></p>
            )}
            {comment.ccEmails && comment.ccEmails.length > 0 && (
              <p>CC: <span className="text-foreground">{comment.ccEmails.join(", ")}</span></p>
            )}
            {comment.subject && (
              <p>Asunto: <span className="text-foreground">{comment.subject}</span></p>
            )}
          </div>
        )}

        {/* Body — modo lectura / modo edición */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={editBuffer}
              onChange={(e) => setEditBuffer(e.target.value)}
              autoFocus
              rows={Math.max(2, Math.min(8, editBuffer.split("\n").length + 1))}
              maxLength={5000}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-muted-foreground">
                ⌘/Ctrl+Enter para guardar · Esc para cancelar
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  className="h-7 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveEdit}
                  disabled={
                    !editBuffer.trim() ||
                    editBuffer.trim() === comment.body.trim()
                  }
                  className="h-7 text-xs"
                >
                  <Check className="mr-1 h-3 w-3" />
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap leading-relaxed">{comment.body}</p>
        )}

        {/* HTML toggle for email */}
        {comment.bodyHtml && (
          <button
            type="button"
            onClick={() => setShowHtml(!showHtml)}
            className="mt-1 text-[12px] text-status-info-fg hover:underline"
          >
            {showHtml ? "Ocultar HTML" : "Ver HTML original"}
          </button>
        )}
        {showHtml && comment.bodyHtml && (
          <div
            className="mt-2 rounded border border-border p-2 bg-background text-sm overflow-auto max-h-[300px] prose prose-sm prose-invert"
            dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
          />
        )}

        {/* Delivery error */}
        {comment.deliveryError && (
          <p className="mt-1 text-[12px] text-status-danger-fg">{comment.deliveryError}</p>
        )}

        {/* Attachments */}
        {atts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {atts.map((att, i) => (
              <a
                key={i}
                href={att.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[12px] hover:bg-accent transition-colors"
              >
                <Paperclip className="h-3 w-3 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{att.fileName}</span>
                {att.size && (
                  <span className="text-muted-foreground">
                    ({att.size > 1024 * 1024
                      ? `${(att.size / 1024 / 1024).toFixed(1)}MB`
                      : `${Math.round(att.size / 1024)}KB`})
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  EMAIL COMPOSER
// ═══════════════════════════════════════════════════════════════

function EmailComposer({
  ticketId,
  ticket,
  comments,
  onSent,
}: {
  ticketId: string;
  ticket: Ticket;
  comments: TicketComment[];
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Re: [${ticket.code}] ${ticket.title}`);
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentKeys, setAttachmentKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Smart pre-fill "To" field
  useEffect(() => {
    // Try last email_in comment's fromEmail
    const lastInbound = [...comments].reverse().find((c) => c.direction === "email_in");
    if (lastInbound?.fromEmail) {
      setTo(lastInbound.fromEmail);
      return;
    }
    // If portal_cliente source and we have reportedBy contact...
    // (caller would need to resolve this — leave empty for now)
  }, [comments]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of Array.from(files)) {
        formData.append("files", f);
      }
      const res = await fetch(`/api/ops/tickets/${ticketId}/email-attachments`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setAttachmentKeys((prev) => [...prev, ...data.data.map((d: any) => d.r2Key)]);
      } else {
        toast.error(data.error || "Error al subir archivos");
      }
    } catch {
      toast.error("Error al subir archivos");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSend() {
    if (!to.trim() || !bodyText.trim()) return;

    setSending(true);
    try {
      const toArr = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccArr = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : [];

      const res = await fetch(`/api/ops/tickets/${ticketId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toArr,
          cc: ccArr.length > 0 ? ccArr : undefined,
          subject,
          bodyText: bodyText.trim(),
          attachmentKeys: attachmentKeys.length > 0 ? attachmentKeys : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Email enviado");
      setTo("");
      setCc("");
      setSubject(`Re: [${ticket.code}] ${ticket.title}`);
      setBodyText("");
      setAttachmentKeys([]);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-status-info-border bg-status-info-soft p-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground w-10 shrink-0">Para:</label>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@ejemplo.com (separar con coma)"
            className="text-sm h-7 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground w-10 shrink-0">CC:</label>
          <Input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Opcional"
            className="text-sm h-7 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-muted-foreground w-10 shrink-0">Asunto:</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-sm h-7 flex-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <ReplyTemplatesMenu
          scope="email"
          align="end"
          context={{
            ticket: { code: ticket.code, title: ticket.title },
            guardia: { nombre: ticket.guardiaName },
            user: { nombre: ticket.assignedToName },
          }}
          onApply={(rendered) => {
            const trimmed = rendered.trim();
            if (!trimmed) return;
            setBodyText((prev) =>
              prev.trim() ? `${prev.trimEnd()}\n${trimmed}` : trimmed,
            );
          }}
        />
      </div>
      <textarea
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        placeholder="Escribe tu mensaje..."
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
      />

      {/* Attachments */}
      {attachmentKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachmentKeys.map((key, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[12px]">
              <Paperclip className="h-2.5 w-2.5" />
              {key.split("/").pop()?.substring(0, 30)}
              <button
                type="button"
                className="text-status-danger-fg ml-1 hover:text-status-danger-fg"
                onClick={() => setAttachmentKeys((prev) => prev.filter((_, j) => j !== i))}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={sending || !to.trim() || !bodyText.trim()}
          onClick={handleSend}
        >
          {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Enviar email
        </Button>

        <label className="cursor-pointer">
          <input type="file" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          <span className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-md border border-border hover:bg-accent transition-colors">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            Adjuntar
          </span>
        </label>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  INFO FIELD
// ═══════════════════════════════════════════════════════════════

function InfoField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-medium ${className ?? ""}`}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  ATTACHMENTS CARD
//  Card unificada para los adjuntos del ticket:
//   - Adjuntos persistidos (subir / ver / descargar / eliminar)
//   - Adjuntos heredados de comentarios y emails (solo lectura)
// ═══════════════════════════════════════════════════════════════

type FlatAttachment = {
  fileName: string;
  url?: string;
  size?: number;
  contentType?: string;
  commentId: string;
  commentDirection: string;
  commentCreatedAt: string;
  authorName: string | null;
};

function flattenAttachments(comments: TicketComment[]): FlatAttachment[] {
  const out: FlatAttachment[] = [];
  for (const c of comments) {
    const atts = (c.attachments ?? []) as Array<{
      fileName: string;
      url?: string;
      size?: number;
      contentType?: string;
    }>;
    if (!Array.isArray(atts) || atts.length === 0) continue;
    for (const a of atts) {
      if (!a?.fileName) continue;
      out.push({
        fileName: a.fileName,
        url: a.url,
        size: a.size,
        contentType: a.contentType,
        commentId: c.id,
        commentDirection: c.direction ?? "internal",
        commentCreatedAt: c.createdAt,
        authorName:
          c.direction === "email_in"
            ? c.fromName || c.fromEmail || "Externo"
            : c.userName ?? null,
      });
    }
  }
  // Más recientes primero.
  return out.sort(
    (a, b) =>
      new Date(b.commentCreatedAt).getTime() -
      new Date(a.commentCreatedAt).getTime(),
  );
}

function formatBytes(size?: number): string | null {
  if (!size || size <= 0) return null;
  if (size > 1024 * 1024)
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(size / 1024)} KB`;
}

const ATT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ATT_MAX_FILES_PER_BATCH = 10;

interface TicketAttachmentDTO {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  storageKey: string;
  url: string;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

function isImageType(contentType?: string, fileName?: string): boolean {
  if (contentType?.startsWith("image/")) return true;
  if (!fileName) return false;
  return /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(fileName);
}

function TicketAttachmentsCard({
  ticketId,
  comments,
  userId,
  userRole,
}: {
  ticketId: string;
  comments: TicketComment[];
  userId: string;
  userRole: string;
}) {
  const [items, setItems] = useState<TicketAttachmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = isAdminRole(userRole);
  const fromComments = useMemo(() => flattenAttachments(comments), [comments]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/attachments`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data);
      }
    } catch {
      // Silencioso: la card sigue funcionando con la última lista cargada.
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (files.length > ATT_MAX_FILES_PER_BATCH) {
        toast.error(`Máximo ${ATT_MAX_FILES_PER_BATCH} archivos por subida`);
        return;
      }
      const tooLarge = files.find((f) => f.size > ATT_MAX_FILE_SIZE);
      if (tooLarge) {
        toast.error(`"${tooLarge.name}" excede el límite de 25 MB`);
        return;
      }

      setUploading(true);
      try {
        const fd = new FormData();
        for (const f of files) fd.append("files", f);
        const res = await fetch(
          `/api/ops/tickets/${ticketId}/attachments`,
          { method: "POST", body: fd },
        );
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Error al subir archivos");
        }
        const created = (data.data ?? []) as TicketAttachmentDTO[];
        setItems((prev) => [...created, ...prev]);
        toast.success(
          created.length === 1
            ? "Archivo subido"
            : `${created.length} archivos subidos`,
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al subir archivos",
        );
      } finally {
        setUploading(false);
      }
    },
    [ticketId],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    void uploadFiles(Array.from(list));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped?.length) void uploadFiles(Array.from(dropped));
  };

  const handleDelete = async (att: TicketAttachmentDTO) => {
    const ok = window.confirm(`¿Eliminar el adjunto "${att.fileName}"?`);
    if (!ok) return;
    setDeletingId(att.id);
    try {
      const res = await fetch(
        `/api/ops/tickets/${ticketId}/attachments/${att.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo eliminar");
      setItems((prev) => prev.filter((it) => it.id !== att.id));
      toast.success("Adjunto eliminado");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar adjunto",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const totalCount = items.length + fromComments.length;

  return (
    <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Adjuntos</h4>
        <span className="text-xs text-muted-foreground">({totalCount})</span>
        <div className="ml-auto">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            Subir
          </Button>
        </div>
      </div>

      {/* Drop zone — visible siempre como hint; resalta al arrastrar. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50"
        }`}
      >
        <p className="text-xs text-muted-foreground">
          Arrastra archivos aquí o{" "}
          <span className="text-primary underline">busca en tu PC</span>
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          Hasta {ATT_MAX_FILES_PER_BATCH} archivos · 25 MB c/u
        </p>
      </div>

      {/* Lista persistidos */}
      {loading ? (
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando adjuntos…
        </div>
      ) : items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((a) => {
            const sizeStr = formatBytes(a.fileSize);
            const dateStr = new Date(a.createdAt).toLocaleString("es-CL", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            });
            const canDelete = isAdmin || a.uploadedBy === userId;
            const isImage = isImageType(a.contentType, a.fileName);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
              >
                {isImage ? (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[13px] font-medium text-foreground hover:underline"
                    title={a.fileName}
                  >
                    {a.fileName}
                  </a>
                ) : (
                  <span
                    className="truncate text-[13px] font-medium text-muted-foreground"
                    title={a.fileName}
                  >
                    {a.fileName}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                  {sizeStr && <span>{sizeStr}</span>}
                  {a.uploadedByName && (
                    <span className="hidden sm:inline">
                      · {a.uploadedByName}
                    </span>
                  )}
                  <span className="hidden sm:inline">· {dateStr}</span>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={a.fileName}
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
                      title="Descargar"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      disabled={deletingId === a.id}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-status-danger-fg hover:bg-status-danger-soft disabled:opacity-50"
                      title="Eliminar adjunto"
                    >
                      {deletingId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">
          No hay adjuntos en este ticket todavía.
        </p>
      )}

      {/* Adjuntos provenientes de comentarios/emails (solo lectura) */}
      {fromComments.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            En mensajes ({fromComments.length})
          </p>
          <ul className="space-y-1">
            {fromComments.map((a, idx) => {
              const sizeStr = formatBytes(a.size);
              const dateStr = new Date(a.commentCreatedAt).toLocaleString(
                "es-CL",
                {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              );
              return (
                <li
                  key={`${a.commentId}-${idx}`}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-[13px] font-medium text-foreground hover:underline"
                      title={a.fileName}
                    >
                      {a.fileName}
                    </a>
                  ) : (
                    <span
                      className="truncate text-[13px] font-medium text-muted-foreground"
                      title={a.fileName}
                    >
                      {a.fileName}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                    {sizeStr && <span>{sizeStr}</span>}
                    {a.authorName && (
                      <span className="hidden sm:inline">
                        · {a.authorName}
                      </span>
                    )}
                    <span className="hidden sm:inline">· {dateStr}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TICKET AUDIT EVENT
//  Render compacto de un evento del audit trail en el timeline.
//  Usa los mismos estilos que TimelineEvent pero con icono específico
//  por tipo + descripción humanizada del cambio.
// ═══════════════════════════════════════════════════════════════

interface TicketEventForRender {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  data: unknown;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de aprobación",
  open: "Abierto",
  in_progress: "En proceso",
  waiting: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const TEAM_LABELS: Record<string, string> = {
  postventa: "Post-venta",
  comercial: "Comercial",
  operaciones: "Operaciones",
  rrhh: "RRHH",
  finanzas: "Finanzas",
  ti: "TI",
};

function describeEvent(ev: TicketEventForRender): {
  icon: React.ReactNode;
  iconBg: string;
  text: string;
} {
  const data = (ev.data ?? {}) as Record<string, unknown>;
  const fmt = (v: unknown) => (v == null ? "—" : String(v));
  switch (ev.type) {
    case "status_changed":
      return {
        icon: <ChevronRight className="h-3 w-3" />,
        iconBg: "bg-primary/20 text-primary",
        text: `Cambió el estado: ${STATUS_LABELS[String(data.from)] ?? fmt(data.from)} → ${STATUS_LABELS[String(data.to)] ?? fmt(data.to)}`,
      };
    case "assignee_changed": {
      if (!data.from && data.to) {
        return {
          icon: <UserCircle className="h-3 w-3" />,
          iconBg: "bg-status-info-soft text-status-info-fg",
          text: `Asignó el ticket`,
        };
      }
      if (data.from && !data.to) {
        return {
          icon: <UserCircle className="h-3 w-3" />,
          iconBg: "bg-status-warn-soft text-status-warn-fg",
          text: "Quitó la asignación",
        };
      }
      return {
        icon: <UserCircle className="h-3 w-3" />,
        iconBg: "bg-status-info-soft text-status-info-fg",
        text: "Reasignó el ticket",
      };
    }
    case "priority_changed":
      return {
        icon: <Zap className="h-3 w-3" />,
        iconBg: "bg-status-warn-soft text-status-warn-fg",
        text: `Cambió prioridad: ${String(data.from).toUpperCase()} → ${String(data.to).toUpperCase()}`,
      };
    case "team_changed":
      return {
        icon: <Users className="h-3 w-3" />,
        iconBg: "bg-status-info-soft text-status-info-fg",
        text: `Cambió equipo: ${TEAM_LABELS[String(data.from)] ?? fmt(data.from)} → ${TEAM_LABELS[String(data.to)] ?? fmt(data.to)}`,
      };
    case "sla_extended":
      return {
        icon: <Calendar className="h-3 w-3" />,
        iconBg: "bg-status-warn-soft text-status-warn-fg",
        text: `Aplazó el SLA${data.reason ? ` — ${String(data.reason)}` : ""}`,
      };
    case "sla_paused":
      return {
        icon: <Pause className="h-3 w-3" />,
        iconBg: "bg-status-warn-soft text-status-warn-fg",
        text: `Pausó el SLA${data.reason ? ` — ${String(data.reason)}` : ""}`,
      };
    case "sla_resumed":
      return {
        icon: <Play className="h-3 w-3" />,
        iconBg: "bg-status-ok-soft text-status-ok-fg",
        text: "Reanudó el SLA",
      };
    case "sla_snoozed":
      return {
        icon: <BellOff className="h-3 w-3" />,
        iconBg: "bg-status-info-soft text-status-info-fg",
        text: `Silenció avisos`,
      };
    case "sla_unsnoozed":
      return {
        icon: <BellOff className="h-3 w-3" />,
        iconBg: "bg-muted text-muted-foreground",
        text: "Reactivó avisos",
      };
    case "approval_decision":
      return {
        icon:
          data.decision === "approved" ? (
            <Check className="h-3 w-3" />
          ) : (
            <Trash2 className="h-3 w-3" />
          ),
        iconBg:
          data.decision === "approved"
            ? "bg-status-ok-soft text-status-ok-fg"
            : "bg-status-danger-soft text-status-danger-fg",
        text: `${data.decision === "approved" ? "Aprobó" : "Rechazó"} paso ${fmt(data.stepOrder)}: ${fmt(data.stepLabel)}${data.comment ? ` — ${String(data.comment)}` : ""}`,
      };
    default:
      return {
        icon: <FileText className="h-3 w-3" />,
        iconBg: "bg-muted text-muted-foreground",
        text: ev.type,
      };
  }
}

function TicketAuditEvent({ event }: { event: TicketEventForRender }) {
  const { icon, iconBg, text } = describeEvent(event);
  return (
    <TimelineEvent
      icon={icon}
      iconBg={iconBg}
      user={event.actorName ?? "Sistema"}
      time={event.createdAt}
      content={text}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
//  REPLY TEMPLATES MENU
//  Render-agnóstico: cualquier composer (interno o email) le pasa
//  un onApply y el contexto. El menú se encarga de listar
//  plantillas (con seed inicial), inyectar la plantilla renderizada
//  y permitir crear nuevas inline.
// ═══════════════════════════════════════════════════════════════

export function ReplyTemplatesMenu({
  context,
  onApply,
  scope = "both",
  align = "start",
}: {
  context: RenderContext;
  onApply: (renderedBody: string) => void;
  scope?: "internal" | "email" | "both";
  align?: "start" | "end";
}) {
  const { templates, save, remove, seedIfEmpty } = useReplyTemplates();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBody, setNewBody] = useState("");

  // Plantillas que aplican al scope actual (los de scope="both" siempre).
  const visible = templates.filter(
    (t) => t.scope === "both" || t.scope === scope,
  );

  function handleApply(t: ReplyTemplate) {
    onApply(renderTemplate(t.body, context));
    setOpen(false);
  }

  function handleSave() {
    if (!newName.trim() || !newBody.trim()) return;
    save({ name: newName.trim(), body: newBody, scope: "both" });
    setNewName("");
    setNewBody("");
    setShowCreate(false);
    toast.success("Plantilla guardada");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (templates.length === 0) seedIfEmpty();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Plantillas de respuesta"
      >
        <Sparkles className="h-3 w-3" />
        Plantillas
        {templates.length > 0 && (
          <span className="opacity-70">({visible.length})</span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => {
              setOpen(false);
              setShowCreate(false);
            }}
          />
          <div
            className={`absolute bottom-full mb-1 z-50 w-80 max-w-[92vw] rounded-xl border border-border bg-popover shadow-md ${
              align === "end" ? "right-0" : "left-0"
            }`}
          >
            <div className="border-b border-border p-2.5">
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Plantillas
              </p>
              <p className="text-[12px] text-muted-foreground/80 mt-0.5">
                Macros: <code>{"{{ticket.code}}"}</code>,{" "}
                <code>{"{{ticket.title}}"}</code>,{" "}
                <code>{"{{guardia.nombre}}"}</code>,{" "}
                <code>{"{{user.nombre}}"}</code>.
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto p-1">
              {visible.length === 0 ? (
                <p className="px-3 py-3 text-center text-[13px] text-muted-foreground">
                  Sin plantillas guardadas. Crea una abajo.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {visible.map((t) => (
                    <li
                      key={t.id}
                      className="group/template flex items-start gap-1 rounded-md px-1.5 py-1 hover:bg-accent"
                    >
                      <button
                        type="button"
                        onClick={() => handleApply(t)}
                        className="flex-1 text-left"
                        title={t.body}
                      >
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[13px] font-medium truncate">
                            {t.name}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2 leading-snug">
                          {t.body}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        className="opacity-0 group-hover/template:opacity-100 rounded p-1 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger-fg transition-opacity"
                        aria-label={`Eliminar plantilla ${t.name}`}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-2.5 space-y-1.5">
              {!showCreate ? (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="w-full text-left text-[13px] text-primary hover:underline"
                >
                  + Nueva plantilla
                </button>
              ) : (
                <>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nombre"
                    maxLength={60}
                    className="h-9 text-[13px]"
                  />
                  <textarea
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    placeholder="Cuerpo (usa {{ticket.code}} etc.)"
                    rows={3}
                    maxLength={2000}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setShowCreate(false);
                        setNewName("");
                        setNewBody("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!newName.trim() || !newBody.trim()}
                      onClick={handleSave}
                    >
                      Guardar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TICKET LINKS (tickets relacionados)
//  Card stand-alone que carga sus propios links. Si el endpoint no
//  existe (M4 no aplicado), la card se oculta sola.
// ═══════════════════════════════════════════════════════════════

interface LinkedTicketSummary {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
}
interface TicketLinkRow {
  id: string;
  direction: "outgoing" | "incoming";
  type: string;
  ticket: LinkedTicketSummary;
  createdAt: string;
}

const LINK_TYPE_LABELS: Record<string, { outgoing: string; incoming: string }> = {
  duplicate_of: { outgoing: "Duplicado de", incoming: "Tiene como duplicado" },
  blocks: { outgoing: "Bloquea a", incoming: "Bloqueado por" },
  blocked_by: { outgoing: "Bloqueado por", incoming: "Bloquea a" },
  relates_to: { outgoing: "Relacionado con", incoming: "Relacionado con" },
  parent_of: { outgoing: "Padre de", incoming: "Hijo de" },
  child_of: { outgoing: "Hijo de", incoming: "Padre de" },
};

function TicketLinksCard({
  ticketId,
  ticketCode,
}: {
  ticketId: string;
  ticketCode: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<TicketLinkRow[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addType, setAddType] = useState<string>("relates_to");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/links`);
      if (!res.ok) {
        if (res.status === 404) setEnabled(false);
        return;
      }
      const data = await res.json();
      if (data?.success && Array.isArray(data.data?.items)) {
        setItems(data.data.items as TicketLinkRow[]);
      }
    } catch {
      // ignore
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) return null;

  async function handleAdd() {
    const code = addCode.trim();
    if (!code) return;
    if (code.toUpperCase() === ticketCode.toUpperCase()) {
      toast.error("No se puede enlazar el ticket consigo mismo");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTicketCode: code, type: addType }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Vinculado");
      setAddCode("");
      setAdding(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo vincular");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(linkId: string) {
    try {
      const res = await fetch(
        `/api/ops/tickets/${ticketId}/links?linkId=${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Vínculo eliminado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Tickets relacionados</h4>
        <span className="text-xs text-muted-foreground">({items.length})</span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto text-[12px] text-primary hover:underline"
        >
          {adding ? "Cancelar" : "Vincular"}
        </button>
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-background/40 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              placeholder="TK-202604-0461"
              maxLength={32}
              className="h-9 text-[13px] font-mono"
            />
            <Select value={addType} onValueChange={setAddType}>
              <SelectTrigger className="h-9 w-[140px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relates_to">Relacionado</SelectItem>
                <SelectItem value="duplicate_of">Duplicado de</SelectItem>
                <SelectItem value="blocks">Bloquea a</SelectItem>
                <SelectItem value="blocked_by">Bloqueado por</SelectItem>
                <SelectItem value="parent_of">Padre de</SelectItem>
                <SelectItem value="child_of">Hijo de</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9 text-xs"
              disabled={!addCode.trim() || submitting}
              onClick={handleAdd}
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Vincular"}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Ingresa el código del ticket destino (ej. TK-202604-0461). Para
            relaciones direccionales (bloqueo / padre-hijo) se crea
            automáticamente el espejo en el otro ticket.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        !adding && (
          <p className="text-[13px] text-muted-foreground">
            No hay tickets relacionados.
          </p>
        )
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const labels = LINK_TYPE_LABELS[it.type];
            const label =
              (labels && labels[it.direction]) ??
              `${it.direction === "outgoing" ? "→" : "←"} ${it.type}`;
            return (
              <li
                key={it.id}
                className="group flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
              >
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground">
                  {label}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/ops/tickets/${it.ticket.id}`)
                  }
                  className="flex flex-1 items-center gap-1.5 truncate text-left hover:underline"
                >
                  <span className="font-mono text-[12px] text-muted-foreground">
                    {it.ticket.code}
                  </span>
                  <span className="truncate text-[13px] font-medium">
                    {it.ticket.title}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(it.id)}
                  className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger-fg transition-opacity"
                  aria-label="Eliminar vínculo"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  CSAT CARD
//  Para tickets terminales (resolved/closed): muestra el resultado
//  si el cliente ya respondió, o el link público para compartir.
//  Si el endpoint no responde 2xx (ambiente sin migración), la card
//  se oculta.
// ═══════════════════════════════════════════════════════════════

interface CsatData {
  token: string | null;
  tokenExp: string | null;
  rating: number | null;
  comment: string | null;
  submittedAt: string | null;
}

function TicketCsatCard({
  ticketId,
  status,
}: {
  ticketId: string;
  status: string;
}) {
  const [data, setData] = useState<CsatData | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  const isTerminal = ["resolved", "closed"].includes(status);

  useEffect(() => {
    if (!isTerminal || !enabled) return;
    let cancelled = false;
    fetch(`/api/ops/tickets/${ticketId}/csat`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            setEnabled(false);
          }
          return null;
        }
        const json = await res.json();
        return json?.success ? (json.data as CsatData) : null;
      })
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticketId, isTerminal, enabled]);

  if (!enabled || !isTerminal) return null;
  if (!data) return null;

  const publicUrl =
    typeof window !== "undefined" && data.token
      ? `${window.location.origin}/csat/${data.token}`
      : null;

  return (
    <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Encuesta de satisfacción</h4>
      </div>

      {data.rating != null ? (
        <div className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl">
              {"★".repeat(data.rating)}
              <span className="text-muted-foreground/40">
                {"★".repeat(5 - data.rating)}
              </span>
            </span>
            <span className="text-sm font-medium tabular-nums">
              {data.rating}/5
            </span>
            {data.submittedAt && (
              <span className="ml-auto text-[12px] text-muted-foreground">
                {new Date(data.submittedAt).toLocaleString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          {data.comment && (
            <p className="text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {data.comment}
            </p>
          )}
        </div>
      ) : publicUrl ? (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Comparte este enlace con el cliente para que califique la
            experiencia. El enlace no requiere login y expira a 30 días.
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              readOnly
              value={publicUrl}
              className="h-9 text-[12px] font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs shrink-0"
              onClick={() => {
                navigator.clipboard
                  .writeText(publicUrl)
                  .then(() => {
                    setCopied(true);
                    toast.success("Enlace copiado");
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => toast.error("No se pudo copiar"));
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Aún no se generó token de encuesta.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TICKET PUBLIC PORTAL (L2)
//  Card admin que emite, revoca y muestra estado del PIN público.
//  El PIN solo es visible UNA VEZ tras emitirlo.
// ═══════════════════════════════════════════════════════════════

interface PublicPinState {
  hasPin: boolean;
  setAt: string | null;
  lastAccessAt: string | null;
}

function TicketPublicPortalCard({
  ticketId,
  ticketCode,
}: {
  ticketId: string;
  ticketCode: string;
}) {
  const [state, setState] = useState<PublicPinState | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [issuedPin, setIssuedPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/public-pin`);
      if (!res.ok) {
        if (res.status === 404) setEnabled(false);
        return;
      }
      const json = await res.json();
      if (json?.success) setState(json.data as PublicPinState);
    } catch {
      // ignore
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) return null;
  if (!state) return null;

  async function handleIssue() {
    setLoading(true);
    setIssuedPin(null);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/public-pin`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setIssuedPin(json.data.pin);
      toast.success("PIN generado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/public-pin`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Acceso público revocado");
      setIssuedPin(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/t/${ticketCode}`
      : `/t/${ticketCode}`;

  return (
    <div className="rounded-xl border border-border bg-ds-surface-1 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Compartir con cliente</h4>
        <span className="ml-auto text-[12px] text-muted-foreground">
          {state.hasPin ? "PIN activo" : "Sin acceso público"}
        </span>
      </div>

      {issuedPin && (
        <div className="rounded-lg border border-status-warn-border bg-status-warn-soft p-3 space-y-1.5">
          <p className="text-[12px] font-medium uppercase tracking-wide text-status-warn-fg">
            PIN — Cópialo ahora
          </p>
          <p className="font-mono text-2xl tracking-[0.3em] text-foreground">
            {issuedPin}
          </p>
          <p className="text-[12px] text-status-warn-fg/80">
            No se volverá a mostrar. Si lo pierdes, genera uno nuevo.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              navigator.clipboard
                .writeText(issuedPin)
                .then(() => toast.success("PIN copiado"))
                .catch(() => toast.error("No se pudo copiar"));
            }}
          >
            Copiar PIN
          </Button>
        </div>
      )}

      {state.hasPin ? (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Tu cliente puede ver el estado del ticket sin login en:
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              readOnly
              value={publicUrl}
              className="h-9 text-[12px] font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs shrink-0"
              onClick={() => {
                navigator.clipboard
                  .writeText(publicUrl)
                  .then(() => toast.success("Enlace copiado"))
                  .catch(() => toast.error("No se pudo copiar"));
              }}
            >
              Copiar
            </Button>
          </div>
          {state.lastAccessAt && (
            <p className="text-[12px] text-muted-foreground">
              Último acceso del cliente:{" "}
              {new Date(state.lastAccessAt).toLocaleString("es-CL", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <div className="flex items-center gap-1.5 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={loading}
              onClick={handleIssue}
            >
              Regenerar PIN
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-status-danger-fg hover:bg-status-danger-soft"
              disabled={loading}
              onClick={handleRevoke}
            >
              Revocar acceso
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Genera un PIN de 6 dígitos para que el cliente vea el estado
            del ticket en una página pública sin login.
          </p>
          <Button
            size="sm"
            className="h-9 text-xs"
            disabled={loading}
            onClick={handleIssue}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generar PIN"}
          </Button>
        </div>
      )}
    </div>
  );
}
