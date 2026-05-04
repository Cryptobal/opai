"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Ticket as TicketIcon, ExternalLink } from "lucide-react";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { EmptyState } from "@/components/opai-ds/EmptyState";
import { Skeleton } from "@/components/opai-ds/Skeleton";
import { cn } from "@/lib/utils";

type TicketRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  assignedTeam: string;
  assignedToName?: string | null;
  slaDueAt: string | null;
  slaBreached: boolean;
};

type StatusMeta = {
  label: string;
  cardBadge: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
};

const STATUS_TO_META: Record<string, StatusMeta> = {
  open:             { label: "Abierto",    cardBadge: "default" },
  in_progress:      { label: "En curso",   cardBadge: "default" },
  pending_approval: { label: "Aprobación", cardBadge: "warning" },
  on_hold:          { label: "En pausa",   cardBadge: "secondary" },
  waiting:          { label: "En espera",  cardBadge: "secondary" },
  resolved:         { label: "Resuelto",   cardBadge: "success" },
  closed:           { label: "Cerrado",    cardBadge: "secondary" },
};

type PriorityKind = "danger" | "warn" | "info" | "neutral";
const PRIORITY_TO_META: Record<string, { label: string; kind: PriorityKind }> = {
  p1: { label: "P1", kind: "danger"  },
  p2: { label: "P2", kind: "warn"    },
  p3: { label: "P3", kind: "info"    },
  p4: { label: "P4", kind: "neutral" },
  p5: { label: "P5", kind: "neutral" },
};

type Props = {
  filterKey: "accountId" | "dealId" | "contactId" | "installationId";
  filterValue: string;
  prefillInstallationId?: string;
};

export function AssociatedTicketsSection({ filterKey, filterValue }: Props) {
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      [filterKey]: filterValue,
      statuses: "open,in_progress,pending_approval,waiting",
      limit: "20",
      page: "1",
    });
    fetch(`/api/ops/tickets?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.success) {
          setError("No se pudieron cargar los tickets");
          return;
        }
        const list: TicketRow[] = j.data?.items ?? j.data?.tickets ?? [];
        setTickets(list);
      })
      .catch(() => !cancelled && setError("No se pudieron cargar los tickets"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filterKey, filterValue]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ds-md border border-status-danger-border bg-status-danger-soft p-3 text-xs text-status-danger-fg">
        {error}
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={<TicketIcon className="h-8 w-8" />}
        title="Sin tickets abiertos"
        description="No hay tickets activos asociados a este registro."
        compact
      />
    );
  }

  const seeAllHref = `/ops/tickets?${filterKey}=${filterValue}`;

  return (
    <div className="space-y-3">
      <CrmRelatedRecordGrid className="!grid-cols-1">
        {tickets.map((t) => (
          <TicketAssociatedCard key={t.id} ticket={t} />
        ))}
      </CrmRelatedRecordGrid>
      <div className="flex items-center justify-end">
        <Link
          href={seeAllHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Ver todos los tickets <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function TicketAssociatedCard({ ticket }: { ticket: TicketRow }) {
  const status = STATUS_TO_META[ticket.status] ?? { label: ticket.status, cardBadge: "secondary" as const };
  const priority = PRIORITY_TO_META[ticket.priority] ?? { label: ticket.priority.toUpperCase(), kind: "neutral" as const };
  const slaLabel = ticket.slaDueAt
    ? new Date(ticket.slaDueAt).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })
    : null;

  const subtitleParts = [ticket.assignedTeam, ticket.assignedToName].filter(Boolean) as string[];
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

  return (
    <CrmRelatedRecordCard
      module="tickets"
      title={`${ticket.code} · ${ticket.title}`}
      subtitle={subtitle}
      meta={
        slaLabel
          ? `SLA ${slaLabel}${ticket.slaBreached ? " (vencido)" : ""}`
          : undefined
      }
      badge={{ label: status.label, variant: status.cardBadge }}
      href={`/ops/tickets/${ticket.id}`}
      actions={
        <span
          className={cn(
            "inline-flex items-center rounded-ds-sm border px-1.5 py-0.5 text-[10px] font-medium font-mono tabular-nums",
            priority.kind === "danger"  && "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
            priority.kind === "warn"    && "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
            priority.kind === "info"    && "bg-status-info-soft border-status-info-border text-status-info-fg",
            priority.kind === "neutral" && "bg-ds-surface-2 border-ds-border-default text-ds-text-2",
          )}
        >
          {priority.label}
        </span>
      }
    />
  );
}
