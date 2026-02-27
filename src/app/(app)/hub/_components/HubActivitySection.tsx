'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { timeAgo } from '@/lib/utils';
import { Activity, ChevronDown } from 'lucide-react';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { groupActivities } from '../_lib/hub-utils';
import { cn } from '@/lib/utils';
import type { ActivityEntry, ActivityCategory } from '../_lib/hub-types';

interface HubActivitySectionProps {
  activities: ActivityEntry[];
}

const CATEGORY_FILTERS: { key: ActivityCategory; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'ops', label: 'Ops' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'sistema', label: 'Sistema' },
];

const categoryDotColor: Record<ActivityCategory, string> = {
  all: 'bg-muted-foreground',
  comercial: 'bg-[#8b5cf6]',
  ops: 'bg-[#10b981]',
  finanzas: 'bg-[#f59e0b]',
  sistema: 'bg-[#64748b]',
};

function formatActivityAction(action: string): string {
  const map: Record<string, string> = {
    create: 'creado',
    update: 'actualizado',
    delete: 'eliminado',
    approve: 'aprobado',
    reject: 'rechazado',
    submit: 'enviado',
    login: 'inicio sesion',
    attendance_mark: 'marcado asistencia',
    profile_update: 'perfil actualizado',
    name_change: 'nombre cambiado',
  };
  return map[action] || action;
}

function formatEntity(type: string): string {
  const map: Record<string, string> = {
    CrmLead: 'lead',
    CrmDeal: 'negocio',
    CrmContact: 'contacto',
    CrmAccount: 'cuenta',
    OpsTurnoExtra: 'turno extra',
    OpsGuardia: 'guardia',
    OpsRondaEjecucion: 'ronda',
    OpsAsistenciaDiaria: 'asistencia',
    FinanceRendicion: 'rendicion',
    Presentation: 'propuesta',
    User: 'usuario',
  };
  return map[type] || type;
}

export function HubActivitySection({ activities }: HubActivitySectionProps) {
  const [activeFilter, setActiveFilter] = useState<ActivityCategory>('all');
  const [showAll, setShowAll] = useState(false);

  const grouped = useMemo(() => groupActivities(activities), [activities]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return grouped;
    return grouped.filter((g) => g.category === activeFilter);
  }, [grouped, activeFilter]);

  const visible = showAll ? filtered : filtered.slice(0, 5);

  if (activities.length === 0) return null;

  return (
    <HubCollapsibleSection
      icon={<Activity className="h-4 w-4" />}
      title="Actividad Reciente"
    >
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => {
              setActiveFilter(filter.key);
              setShowAll(false);
            }}
            className={cn(
              'rounded-full px-3 py-1 text-[10px] font-medium transition-colors',
              activeFilter === filter.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Grouped log */}
      <div className="space-y-1">
        {visible.map((entry) => (
          <div
            key={entry.key}
            className="flex items-start gap-2.5 py-2 text-xs"
          >
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${categoryDotColor[entry.category]}`}
            />
            <div className="min-w-0 flex-1">
              <span className="text-foreground">
                {formatEntity(entry.entity)} {formatActivityAction(entry.action)}
                {entry.count > 1 && (
                  <span className="ml-1 text-muted-foreground">
                    x{entry.count}
                  </span>
                )}
              </span>
              {entry.userEmail && (
                <span className="ml-1 text-muted-foreground/70">
                  por {entry.userEmail.split('@')[0]}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground/70 tabular-nums">
              {timeAgo(entry.lastTimestamp)}
            </span>
          </div>
        ))}
      </div>

      {/* Show more / link to log */}
      <div className="flex items-center justify-between">
        {filtered.length > 5 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-[10px] font-medium text-primary hover:underline flex items-center gap-0.5"
          >
            Ver mas
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
        <Link
          href="/opai/configuracion/auditoria"
          className="text-[10px] font-medium text-primary hover:underline ml-auto"
        >
          Ver log completo
        </Link>
      </div>
    </HubCollapsibleSection>
  );
}
