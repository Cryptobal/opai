'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  Briefcase,
  ShieldCheck,
  Users,
  Wallet,
  CalendarClock,
  Settings2,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { timeAgo, cn } from '@/lib/utils';
import { IconBubble } from '@/components/opai-ds';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { groupActivities } from '../_lib/hub-utils';
import {
  humanizeActivity,
  type ActivityDomain,
} from '../_lib/hub-activity-format';
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

/** Ícono por dominio para la burbuja teñida (tinte vía `tone`). */
const DOMAIN_ICON: Record<ActivityDomain, LucideIcon> = {
  comercial: Briefcase,
  operaciones: ShieldCheck,
  personas: Users,
  finanzas: Wallet,
  productividad: CalendarClock,
  sistema: Settings2,
};

export function HubActivitySection({ activities }: HubActivitySectionProps) {
  const [activeFilter, setActiveFilter] = useState<ActivityCategory>('all');
  const [showAll, setShowAll] = useState(false);

  const grouped = useMemo(() => groupActivities(activities), [activities]);

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return grouped;
    return grouped.filter((g) => g.category === activeFilter);
  }, [grouped, activeFilter]);

  // Móvil arranca resumida (3 entradas); desktop mantiene 5 antes de expandir.
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
              'rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
              activeFilter === filter.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-ds-surface-2 text-ds-text-3 hover:bg-ds-surface-3',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Grouped log — frase humanizada + burbuja teñida por dominio */}
      <div className="space-y-0.5">
        {visible.map((entry, idx) => {
          const h = humanizeActivity({
            action: entry.action,
            entity: entry.entity,
            count: entry.count,
            userEmail: entry.userEmail,
          });
          const Icon = DOMAIN_ICON[h.domain];
          return (
            <div
              key={entry.key}
              className={cn(
                'flex items-start gap-2.5 py-2',
                !showAll && idx >= 3 && 'hidden sm:flex',
              )}
            >
              <IconBubble icon={<Icon />} tone={h.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-ds-text-2">
                  <span className="font-medium text-ds-text-1">{h.actor}</span>{' '}
                  {h.phrase}
                  {!h.countEmbedded && entry.count > 1 && (
                    <span className="text-ds-text-3"> · {entry.count} veces</span>
                  )}
                </p>
                <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                  {h.domainLabel}
                </span>
              </div>
              <span className="shrink-0 text-[12px] text-ds-text-4 tabular-nums">
                {timeAgo(entry.lastTimestamp)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Show more / link to log */}
      <div className="flex items-center justify-between">
        {filtered.length > 3 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={cn(
              'text-[12px] font-medium text-primary hover:underline flex items-center gap-0.5 min-h-11',
              // Desktop ya muestra 5: el botón solo aplica ahí si hay más de 5.
              filtered.length <= 5 && 'sm:hidden',
            )}
          >
            Ver más
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
        <Link
          href="/opai/configuracion/auditoria"
          className="text-[12px] font-medium text-primary hover:underline ml-auto"
        >
          Ver log completo
        </Link>
      </div>
    </HubCollapsibleSection>
  );
}
