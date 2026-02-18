"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Loader2,
  MessageSquare,
  Send,
  User,
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
  isSlaBreached,
  canTransitionTo,
  isPendingMyApproval,
} from "@/lib/tickets";
import { TicketApprovalTimeline } from "./TicketApprovalTimeline";

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

  async function handleTransition(newStatus: TicketStatus) {
    if (!ticket) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setTicket((prev) => prev ? { ...prev, status: newStatus } : null);
      toast.success(`Ticket actualizado a "${TICKET_STATUS_CONFIG[newStatus].label}"`);
    } catch {
      toast.error("Error al cambiar estado");
    } finally {
      setTransitioning(false);
    }
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/ops/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.data) setComments((prev) => [...prev, data.data]);
      setNewComment("");
      toast.success("Comentario agregado");
    } catch {
      toast.error("Error al agregar comentario");
    } finally {
      setSendingComment(false);
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
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ticket no encontrado. Los datos estarán disponibles cuando se conecte la base de datos.
          </p>
        </div>
      </div>
    );
  }

  const statusCfg = TICKET_STATUS_CONFIG[ticket.status];
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const teamCfg = TICKET_TEAM_CONFIG[ticket.assignedTeam];
  const sourceCfg = TICKET_SOURCE_CONFIG[ticket.source];
  const slaText = getSlaRemaining(ticket.slaDueAt);
  const breached = isSlaBreached(ticket.slaDueAt);

  // Available transitions
  const availableTransitions = (Object.keys(TICKET_STATUS_CONFIG) as TicketStatus[]).filter(
    (s) => canTransitionTo(ticket.status, s),
  );

  return (
    <div className="space-y-4">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push("/ops/tickets")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a tickets
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-muted-foreground">{ticket.code}</span>
          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          <span className={`text-xs font-medium ${priorityCfg.color}`}>
            {ticket.priority.toUpperCase()}
          </span>
          {breached && (
            <Badge variant="destructive" className="gap-0.5 text-[10px]">
              <AlertTriangle className="h-2.5 w-2.5" />
              SLA vencido
            </Badge>
          )}
        </div>
        <h2 className="mt-1 text-base font-semibold">{ticket.title}</h2>
      </div>

      {/* Info grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <InfoField label="Tipo" value={ticket.ticketType?.name ?? ticket.category?.name ?? "—"} />
        <InfoField label="Equipo" value={teamCfg?.label ?? ticket.assignedTeam} />
        <InfoField label="Origen" value={sourceCfg?.label ?? ticket.source} />
        {ticket.assignedToName && <InfoField label="Asignado a" value={ticket.assignedToName} />}
        {ticket.installationName && <InfoField label="Instalación" value={ticket.installationName} />}
        {slaText && (
          <InfoField
            label="SLA restante"
            value={slaText}
            className={breached ? "text-red-500" : ""}
          />
        )}
        <InfoField label="Reportado por" value={ticket.reportedByName ?? "—"} />
        <InfoField
          label="Creado"
          value={new Date(ticket.createdAt).toLocaleString("es-CL")}
        />
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Descripción</p>
          <p className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
            {ticket.description}
          </p>
        </div>
      )}

      {/* Tags */}
      {ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ticket.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Status transitions */}
      {availableTransitions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground mr-1">Cambiar estado:</span>
          {availableTransitions.map((status) => {
            const cfg = TICKET_STATUS_CONFIG[status];
            return (
              <Button
                key={status}
                size="sm"
                variant={status === "resolved" ? "default" : "outline"}
                disabled={transitioning}
                onClick={() => handleTransition(status)}
                className="h-7 text-xs"
              >
                {cfg.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Approval chain */}
      {ticket.approvals && ticket.approvals.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
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

      {/* Resolution notes */}
      {ticket.resolutionNotes && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Notas de resolución</p>
          <p className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-3 text-sm">
            {ticket.resolutionNotes}
          </p>
        </div>
      )}

      {/* Comments */}
      <div className="border-t border-border pt-3 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Comentarios ({comments.length})</h4>
        </div>

        {comments.length > 0 && (
          <div className="space-y-2">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`rounded-md border p-3 ${
                  comment.isInternal
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="font-medium">{comment.userName ?? "Usuario"}</span>
                  <span>{new Date(comment.createdAt).toLocaleString("es-CL")}</span>
                  {comment.isInternal && (
                    <Badge variant="outline" className="text-[9px]">
                      Interno
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap">{comment.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* New comment */}
        <div className="flex items-start gap-2">
          <Input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Agregar comentario..."
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
          />
          <Button
            size="icon"
            variant="outline"
            onClick={handleAddComment}
            disabled={!newComment.trim() || sendingComment}
            className="h-9 w-9 shrink-0"
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

function InfoField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm ${className ?? ""}`}>{value}</p>
    </div>
  );
}
