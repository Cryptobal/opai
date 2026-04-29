'use client';

import { Users, Eye, LogIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { timeAgo } from '@/lib/utils';
import type { ClosingPortalTopUser } from '../_lib/hub-types';

interface Props {
  users: ClosingPortalTopUser[];
}

export function HubPortalRanking({ users }: Props) {
  if (users.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-4 text-center">
        <Users className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1.5" />
        <p className="text-sm text-muted-foreground">Sin actividad en el portal (30d)</p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 text-teal-400 shrink-0" />
          <span className="text-sm font-bold truncate">Top clientes en portal</span>
          <span className="text-xs text-teal-400 font-bold tabular-nums bg-teal-500/10 rounded px-1.5 py-0.5">
            {users.length}
          </span>
        </div>
        {/* Leyenda explícita de las dos métricas (antes solo era tooltip) */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <LogIn className="h-3 w-3" /> Ingresos
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> Cotiz. vistas
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {users.map((user, i) => (
          <div key={`${user.accountId}-${i}`} className="px-3.5 py-2.5 flex items-center gap-2.5">
            <span className={`text-sm tabular-nums font-medium w-4 shrink-0 ${i < 3 ? 'text-teal-400' : 'text-muted-foreground'}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium truncate">{user.accountName}</span>
                {user.isProspect && (
                  <Badge variant="outline" className="text-xs h-4 px-1 border-amber-500/30 text-amber-500 shrink-0">
                    Prospecto
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate block">
                {user.contactName}
                {user.lastAccessAt && ` · ${timeAgo(user.lastAccessAt)}`}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1" title="Ingresos al portal (logins en últimos 30d)">
                <LogIn className="h-3.5 w-3.5" />
                <span className="font-bold text-foreground">{user.totalLogins}</span>
              </span>
              <span className="flex items-center gap-1" title="Cotizaciones vistas en portal">
                <Eye className="h-3.5 w-3.5" />
                <span className="font-bold text-foreground">{user.totalQuoteViews}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
