"use client";

import { useRef } from "react";
import {
  AlertTriangle,
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
}

const KANBAN_COLUMNS: { status: TicketStatus; color: string }[] = [
  { status: "open", color: "bg-amber-500" },
  { status: "in_progress", color: "bg-blue-500" },
  { status: "waiting", color: "bg-purple-500" },
  { status: "resolved", color: "bg-emerald-500" },
];

// ═══════════════════════════════════════════════════════════════
//  KANBAN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function TicketsKanban({
  tickets,
  loading,
  onTicketClick,
  onStatusChange,
}: TicketsKanbanProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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
      className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory -mx-1 px-1"
      style={{ scrollSnapType: "x mandatory" }}
    >
      {KANBAN_COLUMNS.map((col) => {
        const colTickets = tickets.filter((t) => t.status === col.status);
        const statusCfg = TICKET_STATUS_CONFIG[col.status];

        return (
          <div
            key={col.status}
            className="flex-none w-[85vw] sm:w-[320px] snap-center"
          >
            {/* Column header */}
            <div className="flex items-center gap-2 mb-2 sticky top-0 z-10">
              <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
              <h3 className="text-xs font-semibold">{statusCfg.label}</h3>
              <span className="text-[10px] text-muted-foreground ml-auto rounded-full bg-muted px-1.5 py-0.5">
                {colTickets.length}
              </span>
            </div>

            {/* Column content */}
            <div className="space-y-2 min-h-[200px] rounded-xl border border-dashed border-border/50 p-2">
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
}: {
  ticket: Ticket;
  onClick: () => void;
}) {
  const priorityCfg = TICKET_PRIORITY_CONFIG[ticket.priority];
  const slaText = getSlaRemaining(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const slaPercent = getSlaPercentage(ticket.slaDueAt, ticket.createdAt, ticket.status, ticket.resolvedAt);
  const slaColor = getSlaColor(slaPercent);
  const slaTextColor = getSlaTextColor(slaPercent);
  const breached = isSlaBreached(ticket.slaDueAt, ticket.status, ticket.resolvedAt);
  const borderColor = getPriorityBorderColor(ticket.priority);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border-l-[3px] border border-border bg-[#161b22] p-2.5 text-left transition-colors hover:bg-[#1c2333] ${borderColor} ${
        breached ? "border-red-500/40" : ""
      }`}
    >
      {/* Header: code + priority */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-mono text-[9px] text-muted-foreground">{ticket.code}</span>
        <span className={`text-[9px] font-semibold ${priorityCfg.color}`}>
          {ticket.priority.toUpperCase()}
        </span>
        {breached && (
          <AlertTriangle className="h-2.5 w-2.5 text-red-500 ml-auto" />
        )}
        {/* Avatar */}
        {ticket.assignedToName ? (
          <div
            className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary"
            title={ticket.assignedToName}
          >
            {ticket.assignedToName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
          </div>
        ) : (
          <UserCircle className="ml-auto h-4 w-4 text-yellow-500/50" />
        )}
      </div>

      {/* Title */}
      <p className="text-[11px] font-medium leading-snug line-clamp-2 mb-1">{ticket.title}</p>

      {/* Team */}
      <p className="text-[10px] text-muted-foreground mb-1">
        {TICKET_TEAM_CONFIG[ticket.assignedTeam]?.label ?? ticket.assignedTeam}
      </p>

      {/* Guard badge */}
      {ticket.guardiaName && (
        <div className="flex items-center gap-1 mb-1">
          <Shield className="h-2.5 w-2.5 text-blue-400" />
          <span className="text-[10px] text-blue-400 truncate">{ticket.guardiaName}</span>
        </div>
      )}

      {/* Tags */}
      {ticket.tags.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-1">
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
      {slaText && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${slaColor}`}
              style={{ width: `${Math.max(slaPercent ?? 0, 2)}%` }}
            />
          </div>
          <span className={`text-[9px] font-medium ${slaTextColor}`}>{slaText}</span>
        </div>
      )}
    </button>
  );
}
