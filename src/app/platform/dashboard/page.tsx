'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlatformKpiCard } from '@/components/platform/PlatformKpiCard';
import { TenantTable } from '@/components/platform/TenantTable';

interface Kpis {
  activeTenants: number;
  activeTenantsGrowth: number;
  totalGuards: number;
  totalGuardsGrowthPct: number;
  estimatedMrr: number;
  expiringTrials: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  status: string;
  activeGuards: number;
  adminCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  trialEndsAt: string | null;
  enabledModules: number;
  usagePct: number;
}

interface DashboardData {
  kpis: Kpis;
  tenants: TenantRow[];
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-200 bg-white p-6">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="mt-4 h-8 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="h-96 rounded-xl border border-gray-200 bg-white" />
    </div>
  );
}

export default function PlatformDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/platform/dashboard');
        if (!res.ok) throw new Error('Failed to fetch dashboard');
        const json: DashboardData = await res.json();
        setData(json);
      } catch {
        // Redirect to login on auth failure
        router.push('/platform/login');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [router]);

  if (loading || !data) {
    return <DashboardSkeleton />;
  }

  const { kpis, tenants } = data;

  async function handleImpersonate(tenantId: string) {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Impersonate failed');
      const { redirectUrl } = await res.json();
      window.location.href = redirectUrl || '/';
    } catch {
      alert('No se pudo iniciar la sesion como este tenant.');
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <PlatformKpiCard
          label="Tenants activos"
          value={kpis.activeTenants}
          trend={{
            value: `+${kpis.activeTenantsGrowth} este mes`,
            positive: true,
          }}
        />
        <PlatformKpiCard
          label="Guardias totales"
          value={kpis.totalGuards}
          trend={{
            value: `${kpis.totalGuardsGrowthPct >= 0 ? '+' : ''}${kpis.totalGuardsGrowthPct}%`,
            positive: kpis.totalGuardsGrowthPct >= 0,
          }}
        />
        <PlatformKpiCard
          label="MRR estimado"
          value={`$${kpis.estimatedMrr.toLocaleString()}`}
        />
        <PlatformKpiCard
          label="Trials por vencer"
          value={kpis.expiringTrials}
          warning={kpis.expiringTrials > 0}
        />
      </div>

      <TenantTable tenants={tenants} onImpersonate={handleImpersonate} />
    </div>
  );
}
