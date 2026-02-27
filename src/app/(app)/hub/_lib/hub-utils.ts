/**
 * Hub utilities — formatting helpers extracted from the monolithic page.
 */

import type { ActivityEntry, GroupedActivity, ActivityCategory } from './hub-types';

export function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function formatPersonName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  return fullName || 'Sin contacto';
}

export function formatLeadSource(source?: string | null): string {
  if (!source) return 'Sin fuente';
  if (source === 'web_cotizador') return 'Cotizador Web';
  if (source === 'web_cotizador_inteligente') return 'Cotizador IA';
  return source;
}

export function getScheduleState(scheduledAt: Date, now: Date) {
  const diffMs = scheduledAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    return {
      label: 'Vencido',
      className: 'text-[10px] border-red-500/30 text-red-500',
    };
  }

  if (diffMs <= 24 * 60 * 60 * 1000) {
    return {
      label: 'Hoy',
      className: 'text-[10px] border-amber-500/30 text-amber-500',
    };
  }

  return {
    label: 'Próximo',
    className: 'text-[10px] border-emerald-500/30 text-emerald-500',
  };
}

export function formatScheduleDate(date: Date): string {
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Returns today's date string in Chile timezone (YYYY-MM-DD).
 * Used for day-boundary queries (attendance, rounds, etc.)
 */
export function getTodayChile(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Santiago',
  });
}

/**
 * Returns a greeting based on the current hour in Chile timezone.
 */
export function getGreeting(): string {
  const hour = parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: 'America/Santiago',
      hour: 'numeric',
      hour12: false,
    }),
    10,
  );
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ------------------------------------------------------------------ */
/* Activity grouping (client-safe — no Prisma imports)                */
/* ------------------------------------------------------------------ */

function resolveCategory(entity: string): ActivityCategory {
  if (['CrmLead', 'CrmDeal', 'CrmContact', 'CrmAccount', 'Presentation'].includes(entity)) return 'comercial';
  if (['OpsGuardia', 'OpsTurnoExtra', 'OpsRondaEjecucion', 'OpsAsistenciaDiaria', 'OpsPuestoOperativo'].includes(entity)) return 'ops';
  if (['FinanceRendicion'].includes(entity)) return 'finanzas';
  return 'sistema';
}

export function groupActivities(activities: ActivityEntry[]): GroupedActivity[] {
  const groups = new Map<string, GroupedActivity>();

  for (const entry of activities) {
    const key = `${entry.action}:${entry.entity}`;
    const existing = groups.get(key);

    if (existing) {
      existing.count++;
      if (new Date(entry.createdAt) < existing.firstTimestamp) {
        existing.firstTimestamp = new Date(entry.createdAt);
      }
      if (new Date(entry.createdAt) > existing.lastTimestamp) {
        existing.lastTimestamp = new Date(entry.createdAt);
      }
    } else {
      groups.set(key, {
        key,
        action: entry.action,
        entity: entry.entity,
        category: resolveCategory(entry.entity),
        count: 1,
        firstTimestamp: new Date(entry.createdAt),
        lastTimestamp: new Date(entry.createdAt),
        userEmail: entry.userEmail,
        entityId: entry.entityId,
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.lastTimestamp.getTime() - a.lastTimestamp.getTime()
  );
}
