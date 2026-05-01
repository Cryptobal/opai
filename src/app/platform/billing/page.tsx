'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BillingTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  billingStatus: string;
  activeGuards: number;
  planPrice: number;
  addons: { name: string; price: number }[];
  addonsTotal: number;
  packDiscount: number;
  monthlyTotal: number;
  currency: string;
}

interface BillingData {
  tenants: BillingTenant[];
  totals: { mrr: number; totalGuards: number; activeTenants: number };
}

type StatusFilter = 'all' | 'trial' | 'active' | 'past_due' | 'suspended';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'trial', label: 'Trial' },
  { key: 'active', label: 'Active' },
  { key: 'past_due', label: 'Past Due' },
  { key: 'suspended', label: 'Suspended' },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'bg-emerald-100 text-status-ok-fg',
  trial: 'bg-amber-100 text-status-warn-fg',
  past_due: 'bg-red-100 text-status-danger-fg',
  suspended: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
};

function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-500';
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BillingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-10 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />
        ))}
      </div>
      <div className="h-96 rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
    </div>
  );
}

function exportCsv(tenants: BillingTenant[]) {
  const headers = [
    'Tenant',
    'Slug',
    'Plan',
    'Estado',
    'Guardias',
    'Plan (UF)',
    'Add-ons (UF)',
    'Descuentos (UF)',
    'Total (UF)',
  ];

  const rows = tenants.map((t) => [
    t.name,
    t.slug,
    t.plan,
    t.billingStatus,
    t.activeGuards.toString(),
    t.planPrice.toFixed(2),
    t.addonsTotal.toFixed(2),
    t.packDiscount.toFixed(2),
    t.monthlyTotal.toFixed(2),
  ]);

  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `opai-billing-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlatformBillingPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    async function fetchBilling() {
      try {
        const res = await fetch('/api/platform/billing');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/platform/login');
            return;
          }
          throw new Error('Failed to fetch billing data');
        }
        const json: BillingData = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }
    fetchBilling();
  }, [router]);

  if (loading) return <BillingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-lg text-status-danger-fg">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const filtered =
    filter === 'all'
      ? data.tenants
      : data.tenants.filter((t) => t.billingStatus === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Facturaci&oacute;n</h1>
        <button
          onClick={() => exportCsv(filtered)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Exportar CSV
        </button>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Tenant</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Plan</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Guardias</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Plan (UF)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Add-ons (UF)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Descuentos (UF)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">Total (UF)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-status-info-fg">
                    {t.plan}
                  </span>
                  <span
                    className={`ml-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(t.billingStatus)}`}
                  >
                    {t.billingStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  {t.activeGuards}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  {t.planPrice.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                  {t.addonsTotal > 0 ? (
                    <span
                      title={t.addons.map((a) => `${a.name}: ${a.price.toFixed(2)} UF`).join('\n')}
                      className="cursor-help border-b border-dashed border-gray-400 dark:border-gray-500"
                    >
                      {t.addonsTotal.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {t.packDiscount > 0 ? (
                    <span className="text-status-danger-fg dark:text-status-danger-fg">
                      -{t.packDiscount.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">
                  {t.monthlyTotal.toFixed(2)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No hay tenants con este estado.
                </td>
              </tr>
            )}
          </tbody>
          {/* Footer totals */}
          <tfoot className="border-t-2 border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                {data.totals.activeTenants} tenants activos
              </td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                {data.totals.totalGuards}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                {filtered.reduce((sum, t) => sum + t.planPrice, 0).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">
                {filtered.reduce((sum, t) => sum + t.addonsTotal, 0).toFixed(2)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-status-danger-fg dark:text-status-danger-fg">
                {filtered.reduce((sum, t) => sum + t.packDiscount, 0) > 0
                  ? `-${filtered.reduce((sum, t) => sum + t.packDiscount, 0).toFixed(2)}`
                  : '\u2014'}
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-gray-100">
                MRR: {formatCurrency(data.totals.mrr)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
