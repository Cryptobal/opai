"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellOff,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  Paperclip,
  Pause,
  Plane,
  Play,
  Send,
  Shield,
  Trash2,
  User,
  UserCircle,
  Users,
  Zap,
} from "lucide-react";
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

interface TicketDetailClientProps {
  ticketId: string;
  userRole: string;
  userId: string;
  userGroupIds: string[];
}

export function TicketDetailClient({ ticketId, userRole, userId, userGroupIds }: TicketDetailClientProps) {
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
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
      const [ticketRes, commentsRes] = await Promise.all([
        fetch(`/api/ops/tickets/${ticketId}`),
        fetch(`/api/ops/tickets/${ticketId}/comments`),
      ]);
      const ticketData = await ticketRes.json();
      const commentsData = await commentsRes.json();
      if (ticketData.success) setTicket(ticketData.data);
      if (commentsData.success) setComments(commentsData.data.items);
    } catch {
      toast.error("Error al cargar ticket");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

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
      <div className={`rounded-xl border bg-[#161b22] p-4 space-y-3 ${breached && !isTerminal ? "border-status-danger-border" : "border-border"}`}>
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
            <Badge variant="destructive" className="gap-0.5 text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              SLA vencido
            </Badge>
          )}
          {ticket.slaPausedAt && (
            <Badge variant="secondary" className="gap-0.5 text-[10px] bg-status-warn-soft text-status-warn-fg border-status-warn-border">
              <Pause className="h-2.5 w-2.5" />
              SLA pausado
            </Badge>
          )}
          {ticket.snoozedUntil && new Date(ticket.snoozedUntil) > new Date() && (
            <Badge variant="secondary" className="gap-0.5 text-[10px] bg-status-info-soft text-status-info-fg border-status-info-border">
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
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Guard badge */}
        {ticket.guardiaName && (
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
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
                <p className="text-[10px] text-status-info-fg/60">
                  {[ticket.guardiaRut, ticket.guardiaCode].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-status-info-fg/50" />
            </button>
          </div>
        )}

        {/* Responsible */}
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
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
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
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
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
              SLA restante
            </p>
            <SlaBar
              slaDueAt={ticket.slaDueAt}
              createdAt={ticket.createdAt}
              status={ticket.status}
              resolvedAt={ticket.resolvedAt}
            />
          </div>
        )}
      </div>

      {/* ── CARD: SLA Controls ── */}
      {ticket.slaDueAt && !isTerminal && (
        <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Controles SLA
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Extend SLA */}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setShowExtendModal(true)}
            >
              <Calendar className="h-3 w-3" />
              Aplazar SLA
            </Button>

            {/* Pause / Resume SLA */}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1 ${ticket.slaPausedAt ? "border-status-warn-border text-status-warn-fg" : ""}`}
              disabled={pauseLoading}
              onClick={handleTogglePause}
            >
              {pauseLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : ticket.slaPausedAt ? (
                <Play className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )}
              {ticket.slaPausedAt ? "Reanudar SLA" : "Pausar SLA"}
            </Button>

            {/* Snooze notifications */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              >
                <BellOff className="h-3 w-3" />
                Silenciar avisos
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
                  <span className="text-[10px]">
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
        <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Descripción
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
        </div>
      )}

      {/* ── CARD: Approval chain ── */}
      {ticket.approvals && ticket.approvals.length > 0 && (
        <div className="rounded-xl border border-border bg-[#161b22] p-4">
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
          <p className="text-[10px] font-medium uppercase tracking-wider text-status-ok-fg">
            Notas de resolución
          </p>
          <p className="text-sm whitespace-pre-wrap">{ticket.resolutionNotes}</p>
        </div>
      )}

      {/* ── CARD: Activity Timeline ── */}
      <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Actividad</h4>
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        </div>

        {/* Timeline */}
        <div className="relative space-y-0">
          {comments.length > 0 && (
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-border" />
          )}

          <TimelineEvent
            icon={<Check className="h-3 w-3" />}
            iconBg="bg-primary/20 text-primary"
            user={ticket.reportedByName ?? "Usuario"}
            time={ticket.createdAt}
            content="Creó el ticket"
          />

          {comments.map((comment) => (
            <EmailTimelineEvent
              key={comment.id}
              comment={comment}
              isSending={comment.id.startsWith("temp-")}
            />
          ))}
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
}: {
  comment: TicketComment;
  isSending: boolean;
}) {
  const [showHtml, setShowHtml] = useState(false);
  const dir = comment.direction ?? "internal";

  const timeStr = new Date(comment.createdAt).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

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

      <div className={`min-w-0 flex-1 rounded-lg border p-2 ${cfg.bg}`}>
        {/* Header row */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="font-medium">
            {dir === "email_in" ? (comment.fromName || comment.fromEmail || "Externo") : (comment.userName ?? "Usuario")}
          </span>
          <span className="text-muted-foreground">{timeStr}</span>
          {cfg.label && (
            <Badge variant="outline" className="text-[9px]">
              {cfg.label}
            </Badge>
          )}
          {comment.deliveryStatus && (
            <span className={`text-[10px] font-medium ${deliveryColors[comment.deliveryStatus] ?? "text-muted-foreground"}`}>
              {comment.deliveryStatus === "sent" ? "Enviado" : comment.deliveryStatus === "delivered" ? "Entregado" : comment.deliveryStatus === "failed" ? "Falló" : comment.deliveryStatus}
            </span>
          )}
          {isSending && (
            <span className="text-[10px] text-muted-foreground italic">Enviando...</span>
          )}
        </div>

        {/* Email addressing info */}
        {(dir === "email_out" || dir === "email_in") && (
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
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

        {/* Body */}
        <p className="mt-1 text-sm whitespace-pre-wrap leading-relaxed">{comment.body}</p>

        {/* HTML toggle for email */}
        {comment.bodyHtml && (
          <button
            type="button"
            onClick={() => setShowHtml(!showHtml)}
            className="mt-1 text-[10px] text-status-info-fg hover:underline"
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
          <p className="mt-1 text-[11px] text-status-danger-fg">{comment.deliveryError}</p>
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
                className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-[11px] hover:bg-accent transition-colors"
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
      const res = await fetch(`/api/ops/tickets/${ticketId}/attachments`, {
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
          <label className="text-[11px] text-muted-foreground w-10 shrink-0">Para:</label>
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@ejemplo.com (separar con coma)"
            className="text-sm h-7 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground w-10 shrink-0">CC:</label>
          <Input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Opcional"
            className="text-sm h-7 flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-muted-foreground w-10 shrink-0">Asunto:</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-sm h-7 flex-1"
          />
        </div>
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
            <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px]">
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-medium ${className ?? ""}`}>{value}</p>
    </div>
  );
}
