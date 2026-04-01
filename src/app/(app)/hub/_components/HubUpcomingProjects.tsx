'use client';

import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import type { UpcomingProject } from '../_lib/hub-types';
import { formatCLP } from '../_lib/hub-utils';

interface Props {
  projects: UpcomingProject[];
}

function formatStartDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function HubUpcomingProjects({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <CalendarClock className="h-3.5 w-3.5 text-teal-400" />
        <p className="text-sm font-bold">Proyectos por iniciar</p>
        <span className="text-xs text-teal-400 font-bold tabular-nums bg-teal-500/10 rounded px-1.5 py-0.5">
          {projects.length}
        </span>
      </div>
      <div className="divide-y divide-border">
        {projects.map((p) => {
          const days = daysUntil(p.serviceStartDate);
          const isPast = days < 0;
          const isToday = days === 0;
          const isSoon = days > 0 && days <= 7;

          return (
            <Link
              key={p.id}
              href={`/crm/deals/${p.id}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
            >
              <div
                className="w-0.5 self-stretch rounded-full shrink-0"
                style={{ backgroundColor: p.stageColor || '#94a3b8' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium truncate">{p.title}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {p.accountName}
                  {p.contactName && ` · ${p.contactName}`}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span className="tabular-nums">{formatCLP(p.amountClp)}</span>
                  {p.totalGuards > 0 && <span>{p.totalGuards} guardias</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">
                  {formatStartDate(p.serviceStartDate)}
                </p>
                <p
                  className={`text-xs font-medium ${
                    isPast
                      ? 'text-red-400'
                      : isToday
                        ? 'text-amber-400'
                        : isSoon
                          ? 'text-orange-400'
                          : 'text-muted-foreground'
                  }`}
                >
                  {isPast
                    ? `${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''} atrasado`
                    : isToday
                      ? 'Hoy'
                      : `en ${days} día${days !== 1 ? 's' : ''}`}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
