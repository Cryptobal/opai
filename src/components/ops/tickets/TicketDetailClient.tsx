"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Trash2,
  User,
  UserCircle,
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
  const [assigningUser, setAssigningUser] = useState(false);

  // Mention autocomplete state
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // Fetch admins for @mention and assignee
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
      if (!afterAt.includes("  ") && afterAt.split(" ").length <= 2) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentionList(true);
        return;
      }
    }
    setShowMentionList(false);
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
        <button
          type="button"
          onClick={() => router.push("/ops/tickets")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a tickets
        </button>
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

  const availableTransitions = (Object.keys(TICKET_STATUS_CONFIG) as TicketStatus[]).filter(
    (s) => canTransitionTo(ticket.status, s),
  );

  return (
    <div className="space-y-3 pb-24">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push("/ops/tickets")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a tickets
      </button>

      {/* ── CARD: Header ── */}
      <div className={`rounded-xl border bg-[#161b22] p-4 space-y-3 ${breached ? "border-red-500/40" : "border-border"}`}>
        {/* Row 1: Code + Status + Priority + Delete */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">{ticket.code}</span>
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          <span className={`text-xs font-semibold ${priorityCfg.color}`}>
            {ticket.priority.toUpperCase()}
          </span>
          {breached && (
            <Badge variant="destructive" className="gap-0.5 text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              SLA vencido
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
              className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 transition-colors hover:bg-blue-500/20"
            >
              <Shield className="h-4 w-4 text-blue-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-blue-400">{ticket.guardiaName}</p>
                <p className="text-[10px] text-blue-400/60">
                  {[ticket.guardiaRut, ticket.guardiaCode].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ChevronRight className="ml-auto h-3.5 w-3.5 text-blue-400/50" />
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
              className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm text-yellow-500 transition-colors hover:bg-yellow-500/10"
            >
              <UserCircle className="h-4 w-4" />
              <span className="font-medium">Sin asignar</span>
              <span className="text-xs text-yellow-500/60 ml-auto">Asignar</span>
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

      {/* ── CARD: Description ── */}
      {ticket.description && (
        <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Descripción
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
        </div>
      )}

      {/* ── CARD: Change Status ── */}
      {availableTransitions.length > 0 && (
        <div className="rounded-xl border border-border bg-[#161b22] p-4 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Cambiar estado
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTransitions.map((status) => {
              const cfg = TICKET_STATUS_CONFIG[status];
              const isResolve = status === "resolved";
              return (
                <Button
                  key={status}
                  size="sm"
                  variant={isResolve ? "default" : "outline"}
                  disabled={transitioning}
                  onClick={() => handleTransition(status)}
                  className="h-8 text-xs rounded-lg"
                >
                  {cfg.label}
                </Button>
              );
            })}
          </div>
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
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">
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
          {/* Timeline line */}
          {comments.length > 0 && (
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-border" />
          )}

          {/* Ticket creation event */}
          <TimelineEvent
            icon={<Check className="h-3 w-3" />}
            iconBg="bg-primary/20 text-primary"
            user={ticket.reportedByName ?? "Usuario"}
            time={ticket.createdAt}
            content="Creó el ticket"
          />

          {/* Comments */}
          {comments.map((comment) => (
            <TimelineEvent
              key={comment.id}
              icon={<User className="h-3 w-3" />}
              iconBg={comment.isInternal ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground"}
              user={comment.userName ?? "Usuario"}
              time={comment.createdAt}
              content={comment.body}
              isInternal={comment.isInternal}
              isSending={comment.id.startsWith("temp-")}
            />
          ))}
        </div>

        {/* New comment input */}
        <div className="flex items-start gap-2 pt-2 border-t border-border">
          <div className="relative flex-1">
            <Input
              value={newComment}
              onChange={handleCommentChange}
              placeholder="Agregar comentario... (@ para mencionar)"
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
            {/* Mention dropdown */}
            {showMentionList && (
              <div className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto rounded-xl border border-border bg-popover shadow-md z-50">
                {availableUsers
                  .filter((u) => u.name.toLowerCase().includes(mentionFilter))
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
                {availableUsers.filter((u) => u.name.toLowerCase().includes(mentionFilter)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No se encontraron usuarios</p>
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
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  TIMELINE EVENT
// ═══════════════════════════════════════════════════════════════

function TimelineEvent({
  icon,
  iconBg,
  user,
  time,
  content,
  isInternal,
  isSending,
}: {
  icon: React.ReactNode;
  iconBg: string;
  user: string;
  time: string;
  content: string;
  isInternal?: boolean;
  isSending?: boolean;
}) {
  const timeStr = new Date(time).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`relative flex gap-3 py-2 ${isSending ? "opacity-60" : ""}`}>
      {/* Icon */}
      <div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{user}</span>
          <span className="text-muted-foreground">{timeStr}</span>
          {isInternal && (
            <Badge variant="outline" className="text-[9px]">
              Interno
            </Badge>
          )}
          {isSending && (
            <span className="text-[10px] text-muted-foreground italic">Enviando...</span>
          )}
        </div>
        <p className="mt-0.5 text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
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
