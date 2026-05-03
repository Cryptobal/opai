import Link from 'next/link';
import { Inbox, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import { formatLeadSource } from '../_lib/hub-utils';
import type { ClosingPendingLead } from '../_lib/hub-types';

interface Props {
  leads: ClosingPendingLead[];
}

export function HubPendingLeads({ leads }: Props) {
  if (leads.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <Inbox className="h-3.5 w-3.5 text-muted-foreground/50" />
          <p className="text-sm font-bold">Leads pendientes</p>
        </div>
        <p className="text-sm text-muted-foreground">No hay leads pendientes.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Inbox className="h-3.5 w-3.5 text-status-info-fg" />
        <p className="text-sm font-bold">Leads pendientes</p>
        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-status-info-border text-status-info-fg">
          {leads.length}
        </Badge>
      </div>
      <div className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border/50">
        {leads.map((lead) => (
          <Link
            key={lead.id}
            href={`/crm/leads/${lead.id}`}
            className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/20"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold break-words">
                {lead.companyName || lead.contactName}
              </p>
              {lead.companyName && (
                <p className="text-sm text-muted-foreground break-words">{lead.contactName}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">{formatLeadSource(lead.source)}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(lead.createdAt)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
