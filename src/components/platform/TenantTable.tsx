'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

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

interface TenantTableProps {
  tenants: TenantRow[];
  onImpersonate: (tenantId: string) => void;
}

type SortKey = 'name' | 'plan' | 'status' | 'activeGuards' | 'lastLoginAt' | 'createdAt';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 20;

const planBadgeVariant: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-700',
  essential: 'bg-gray-100 text-gray-700',
  professional: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

const statusBadgeVariant: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Hace menos de 1h';
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  return `Hace ${Math.floor(days / 30)}m`;
}

function trialDaysLeft(trialEndsAt: string | null): string {
  if (!trialEndsAt) return '';
  const days = Math.ceil(
    (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return '(vencido)';
  return `(${days}d)`;
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
      <button
        type="button"
        className="group inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className={isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}>
          {isActive && currentDir === 'desc' ? '\u2193' : '\u2191'}
        </span>
      </button>
    </th>
  );
}

type StatusFilter = 'all' | 'active' | 'trial' | 'suspended';

export function TenantTable({ tenants, onImpersonate }: TenantTableProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return tenants;
    return tenants.filter((t) => t.status === statusFilter);
  }, [tenants, statusFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'plan':
          cmp = a.plan.localeCompare(b.plan);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'activeGuards':
          cmp = a.activeGuards - b.activeGuards;
          break;
        case 'lastLoginAt':
          cmp =
            new Date(a.lastLoginAt || 0).getTime() -
            new Date(b.lastLoginAt || 0).getTime();
          break;
        case 'createdAt':
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filters: { label: string; value: StatusFilter }[] = [
    { label: 'Todos', value: 'all' },
    { label: 'Activos', value: 'active' },
    { label: 'Trial', value: 'trial' },
    { label: 'Suspendidos', value: 'suspended' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatusFilter(f.value);
              setPage(0);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400">
          {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800">
            <tr>
              <SortHeader
                label="Empresa"
                sortKey="name"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Plan"
                sortKey="plan"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Estado"
                sortKey="status"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Guardias"
                sortKey="activeGuards"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Uso 30d
              </th>
              <SortHeader
                label="Ultimo login"
                sortKey="lastLoginAt"
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {paginated.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800">
                {/* Empresa */}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{t.name}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{t.slug}</div>
                </td>
                {/* Plan */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      planBadgeVariant[t.plan] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t.plan}
                  </span>
                </td>
                {/* Estado */}
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      statusBadgeVariant[t.status] || 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {t.status}
                  </span>
                  {t.status === 'trial' && t.trialEndsAt && (
                    <span className="ml-1 text-xs text-amber-600">
                      {trialDaysLeft(t.trialEndsAt)}
                    </span>
                  )}
                </td>
                {/* Guardias */}
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{t.activeGuards}</td>
                {/* Uso 30d */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className={`h-full rounded-full ${
                          t.usagePct > 80 ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(t.usagePct, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t.usagePct}%</span>
                  </div>
                </td>
                {/* Ultimo login */}
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {timeAgo(t.lastLoginAt)}
                </td>
                {/* Acciones */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/platform/tenants/${t.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/platform/tenants/${t.id}?tab=plan`}
                      className="text-xs font-medium text-gray-600 hover:text-gray-800"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => onImpersonate(t.id)}
                      className="text-xs font-medium text-purple-600 hover:text-purple-800"
                    >
                      Entrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No se encontraron tenants.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Pagina {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:bg-gray-700"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
