"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Shield,
  UserCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  type Ticket,
  type TicketStatus,
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_TEAM_CONFIG,
  getSlaRemaining,
  getSlaPercentage,
  getSlaColor,
  getSlaTextColor,
  getPriorityBorderColor,
  isSlaBreached,
} from "@/lib/tickets";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface TicketsKanbanProps {
  tickets: Ticket[];
  loading: boolean;
  onTicketClick: (id: string) => void;
  onStatusChange: (ticketId: string, newStatus: TicketStatus) => void;
  currentUserId?: string;
}

const KANBAN_COLUMNS: { status: TicketStatus; extraStatuses?: TicketStatus[]; color: string }[] = [
  { status: "pending_approval", color: "bg-status-warn" },
  { status: "open", color: "bg-status-warn" },
  { status: "in_progress", color: "bg-status-info" },
  { status: "waiting", color: "bg-tint-violet-fg" },
  { status: "resolved", extraStatuses: ["closed"], color: "bg-status-ok" },
  { status: "cancelled", color: "bg-status-danger" },
];

// ═══════════════════════════════════════════════════════════════
//  KANBAN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function TicketsKanban({
  tickets,
  loading,
  onTicketClick,
  onStatusChange,
  currentUserId,
}: TicketsKanbanProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(status: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto pb-4 snap-x snap-mandatory -mx-1 px-1"
      style={{ scrollSnapType: "x mandatory" }}
    >
      {KANBAN_COLUMNS.map((col) => {
        const matchStatuses = [col.status, ...(col.extraStatuses ?? [])];
        const colTickets = tickets.filter((t) => matchStatuses.includes(t.status));
        const statusCfg = TICKET_STATUS_CONFIG[col.status];
        const isCollapsed = collapsed.has(col.status);

        // Hide terminal columns (cancelled) if empty
        const isTerminalCol = ["cancelled", "rejected"].includes(col.status);
        if (isTerminalCol && colTickets.length === 0) return null;

        if (isCollapsed) {
          return (
            <button
              key={col.status}
              type="button"
              onClick={() => toggleCollapse(col.status)}
              className="flex-none w-10 snap-center rounded-xl border border-dashed border-border/50 p-2 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors"
            >
              <div className={`h-2.5 w-2.5 rounded-full ${col.color} shrink-0`} />
              <span className="text-[10px] font-medium text-muted-foreground [writing-mode:vertical-lr] rotate-180">
                {statusCfg.label}
              </span>
              <span className="text-[10px] text-muted-foreground rounded-full bg-muted px-1.5 py-0.5 shrink-0">
                {colTickets.length}
              </span>
            </button>
          );
        }

        return (
          <div
            key={col.status}
            className="flex-none w-[80vw] sm:w-[280px] snap-center"
          >
            {/* Column header */}
            <button
              type="button"
              onClick={() => toggleCollapse(col.status)}
              className="flex items-center gap-2 mb-2 sticky top-0 z-10 w-full text-left group"
            >
              <div className={`h-2.5 w-2.5 rounded-full ${col.color} shrink-0`} />
              <h3 className="text-xs font-semibold truncate">{statusCfg.label}</h3>
              <span className="text-[10px] text-muted-foreground rounded-full bg-muted px-1.5 py-0.5 shrink-0">
                {colTickets.length}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Column content */}
            <div className="space-y-2 min-h-[120px] rounded-xl border border-dashed border-border/50 p-1.5">
              {colTickets.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-muted-foreground/50">
                  Sin tickets
                </p>
              ) : (
                colTickets.map((ticket) => (
                  <KanbanCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => onTicketClick(ticket.id)}
                    isMine={Boolean(currentUserId) && ticket.assignedTo === currentUserId}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  KANBAN CARD (compact)
// ═══════════════════════════════════════════════════════════════

function KanbanCard({
  ticket,
  onClick,
  isMine,
}: {
  ticket: Ticket;
  onClick: () => void;
  isMine?: boolean;
}) {
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const slaText = getSlaRemaining(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const slaPercent = getSlaPercentage(ticket.slaDueAt, ticket.createdAt, ticket.status, ticket.resolvedAt);
  const slaColor = getSlaColor(slaPercent);
  const slaTextColor = getSlaTextColor(slaPercent);
  const breached = isSlaBreached(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const isTerminal = ["resolved", "closed", "rejected", "cancelled"].includes(ticket.status);
  const borderColor = getPriorityBorderColor(ticket.priority);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border-l-[3px] border border-border bg-[#161b22] p-2 text-left transition-colors hover:bg-[#1c2333] ${borderColor} ${
        breached && !isTerminal ? "border-status-danger-border" : ""
      }`}
    >
      {/* Header: code + priority + avatar */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[9px] text-muted-foreground">{ticket.code}</span>
        <span className={`text-[9px] font-semibold ${priorityCfg.color}`}>
          {ticket.priority.toUpperCase()}
        </span>
        {isMine && (
          <span
            className="rounded bg-primary/15 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-primary"
            title="Asignado a ti"
          >
            Mío
          </span>
        )}
        {breached && !isTerminal && (
          <AlertTriangle className="h-2.5 w-2.5 text-status-danger-fg ml-auto" />
        )}
        {ticket.assignedToName ? (
          <div
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary"
            title={ticket.assignedToName}
          >
            {ticket.assignedToName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
          </div>
        ) : (
          <UserCircle className="ml-auto h-4 w-4 text-status-warn-fg/50" />
        )}
      </div>

      {/* Title */}
      <p className="text-[11px] font-medium leading-snug line-clamp-2 mb-1">{ticket.title}</p>

      {/* Team */}
      <p className="text-[10px] text-muted-foreground mb-0.5">
        {TICKET_TEAM_CONFIG[ticket.assignedTeam]?.label ?? ticket.assignedTeam}
      </p>

      {/* Guard badge */}
      {ticket.guardiaName && (
        <div className="flex items-center gap-1 mb-0.5">
          <Shield className="h-2.5 w-2.5 text-status-info-fg" />
          <span className="text-[10px] text-status-info-fg truncate">{ticket.guardiaName}</span>
        </div>
      )}

      {/* Tags */}
      {ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-0.5">
          {ticket.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary/10 px-1.5 py-0 text-[8px] text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* SLA bar */}
      {slaText && !isTerminal && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${slaColor}`}
              style={{ width: `${slaPercent === 0 ? 100 : Math.max(slaPercent ?? 0, 2)}%` }}
            />
          </div>
          <span className={`text-[9px] font-medium ${slaTextColor}`}>{slaText}</span>
        </div>
      )}
    </button>
  );
}
