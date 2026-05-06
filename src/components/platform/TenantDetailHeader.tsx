'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface TenantHeaderData {
  tenant: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    suspendedReason: string | null;
    lastActivityAt: string | null;
  };
  plan: {
    plan: string;
    billingStatus: string;
    trialEndsAt: string | null;
  } | null;
  metrics: {
    activeGuards: number;
  };
}

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  starter: 'bg-status-info-soft text-status-info-fg',
  profesional: 'bg-status-info-soft text-status-info-fg',
  enterprise: 'bg-tint-violet text-tint-violet-fg',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-status-ok-soft text-status-ok-fg',
  trial: 'bg-status-warn-soft text-status-warn-fg',
  past_due: 'bg-status-danger-soft text-status-danger-fg',
  suspended: 'bg-status-danger-soft text-status-danger-fg',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Hoy';
  if (days < 30) return `Hace ${days}d`;
  return `Hace ${Math.floor(days / 30)}m`;
}

function trialDaysLeft(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'vencido';
  return `${days}d restantes`;
}

export function TenantDetailHeader({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<TenantHeaderData | null>(null);

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [tenantId]);

  if (!data) {
    return <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />;
  }

  const { tenant, plan, metrics } = data;
  const status = !tenant.active
    ? 'suspended'
    : plan?.billingStatus === 'trial'
      ? 'trial'
      : 'active';
  const trialLabel = plan?.billingStatus === 'trial' ? trialDaysLeft(plan.trialEndsAt) : null;

  const handleImpersonate = async () => {
    const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      window.location.href = json.redirectTo || '/hub';
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {tenant.name}
            </h1>
            {plan && (
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                  PLAN_BADGE[plan.plan] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {plan.plan}
              </span>
            )}
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[status]}`}
            >
              {status === 'active' ? 'Activo' : status === 'trial' ? 'Trial' : 'Suspendido'}
              {trialLabel && status === 'trial' && (
                <span className="ml-1 font-normal opacity-80">· {trialLabel}</span>
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-mono">{tenant.slug}</span>
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <span>{metrics.activeGuards} guardias activos</span>
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <span>Última actividad: {timeAgo(tenant.lastActivityAt)}</span>
          </div>
          {tenant.suspendedReason && (
            <div className="mt-3 rounded-lg border border-status-danger-border bg-status-danger-soft px-3 py-2 text-xs text-status-danger-fg">
              <strong>Suspendido:</strong> {tenant.suspendedReason}
            </div>
          )}
          {plan?.billingStatus === 'trial' && plan.plan === 'enterprise' && tenant.active && (
            <div className="mt-3 rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2 text-xs text-status-warn-fg">
              <strong>Trial activo del plan Enterprise:</strong> sin facturación durante el período de prueba.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleImpersonate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-tint-violet px-3 py-2 text-sm font-medium text-tint-violet-fg hover:brightness-110"
          >
            <ExternalLink className="h-4 w-4" />
            Entrar como tenant
          </button>
        </div>
      </div>
    </div>
  );
}
