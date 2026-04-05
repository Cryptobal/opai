'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { TenantAddonsSection } from './TenantAddonsSection';

// ── Types ──

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  billingEmail: string | null;
  supportEmail: string | null;
  notes: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  onboardedBy: string | null;
  lastActivityAt: string | null;
}

interface TenantPlan {
  plan: string;
  maxGuards: number;
  maxAdmins: number;
  maxStorageMb: number;
  basePrice: number;
  pricePerGuard: number;
  currency: string;
  billingStatus: string;
  trialEndsAt: string | null;
}

interface TenantModule {
  module: string;
  enabled: boolean;
}

interface TenantAdmin {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
}

interface TenantMetrics {
  activeGuards: number;
  totalGuards: number;
  activePuestos: number;
  marcaciones30d: number;
  documentos30d: number;
  rondas30d: number;
}

interface TenantDetail {
  tenant: TenantInfo;
  plan: TenantPlan | null;
  modules: TenantModule[];
  admins: TenantAdmin[];
  metrics: TenantMetrics;
}

// ── Helper Components ──

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 flex items-center gap-2">
          <span className="text-sm text-gray-900 dark:text-gray-100">{value || '—'}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Editar
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 space-y-2">
        {multiline ? (
          <textarea
            className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <input
            type="text"
            className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
          >
            Guardar
          </button>
          <button
            onClick={handleCancel}
            className="rounded border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
        </div>
      </dd>
    </div>
  );
}

function EditableNumberField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const num = Number(draft);
      if (!isNaN(num)) {
        onSave(num);
        setEditing(false);
      }
    } else if (e.key === 'Escape') {
      setDraft(String(value));
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd
          className="mt-1 cursor-pointer text-sm text-gray-900 dark:text-gray-100 hover:text-blue-600"
          onClick={() => setEditing(true)}
        >
          {value}
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1">
        <input
          type="number"
          className="w-24 rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setDraft(String(value));
            setEditing(false);
          }}
          autoFocus
        />
      </dd>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  let color = 'bg-emerald-500';
  if (pct >= 90) color = 'bg-red-500';
  else if (pct >= 70) color = 'bg-amber-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {value} / {max}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Tab Definitions ──

type TabKey = 'info' | 'plan' | 'admins' | 'metrics';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: 'Informacion' },
  { key: 'plan', label: 'Plan y Add-ons' },
  { key: 'admins', label: 'Administradores' },
  { key: 'metrics', label: 'Metricas' },
];

// ── Main Component ──

export function TenantDetailTabs({ tenantId }: { tenantId: string }) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'info';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [data, setData] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`);
      if (!res.ok) throw new Error('Error al cargar tenant');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const patchTenant = async (fields: Record<string, unknown>) => {
    await fetch(`/api/platform/tenants/${tenantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    await fetchData();
  };

  const patchPlan = async (fields: Record<string, unknown>) => {
    await fetch(`/api/platform/tenants/${tenantId}/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    await fetchData();
  };

  const toggleModule = async (module: string, enabled: boolean) => {
    await fetch(`/api/platform/tenants/${tenantId}/modules`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ module, enabled }),
    });
    await fetchData();
  };

  const suspendTenant = async () => {
    const reason = prompt('Razon de suspension:');
    if (!reason) return;
    await fetch(`/api/platform/tenants/${tenantId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    await fetchData();
  };

  const reactivateTenant = async () => {
    await fetch(`/api/platform/tenants/${tenantId}/suspend`, {
      method: 'DELETE',
    });
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
        {error || 'No se pudo cargar el tenant'}
      </div>
    );
  }

  const { tenant, plan, modules, admins, metrics } = data;

  return (
    <div>
      {/* Tab Bar */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600 dark:text-teal-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <InfoTab
          tenant={tenant}
          onPatch={patchTenant}
          onSuspend={suspendTenant}
          onReactivate={reactivateTenant}
        />
      )}
      {activeTab === 'plan' && (
        <TenantAddonsSection tenantId={tenantId} />
      )}
      {activeTab === 'admins' && <AdminsTab admins={admins} />}
      {activeTab === 'metrics' && plan && (
        <MetricsTab metrics={metrics} plan={plan} admins={admins} />
      )}
      {activeTab === 'metrics' && !plan && (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6 text-center text-gray-500 dark:text-gray-400">
          No hay plan configurado para mostrar metricas.
        </div>
      )}
    </div>
  );
}

// ── Tab: Informacion ──

function InfoTab({
  tenant,
  onPatch,
  onSuspend,
  onReactivate,
}: {
  tenant: TenantInfo;
  onPatch: (fields: Record<string, unknown>) => Promise<void>;
  onSuspend: () => Promise<void>;
  onReactivate: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {/* Read-only fields */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Datos generales</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{tenant.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Slug</dt>
            <dd className="mt-1 text-sm font-mono text-gray-900 dark:text-gray-100">{tenant.slug}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  tenant.active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {tenant.active ? 'Activo' : 'Inactivo'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Creado</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
              {new Date(tenant.createdAt).toLocaleDateString('es-CL')}
            </dd>
          </div>
          {tenant.suspendedReason && (
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Razon de suspension</dt>
              <dd className="mt-1 text-sm text-red-600">{tenant.suspendedReason}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Onboarded por</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{tenant.onboardedBy || '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Editable fields */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Contacto y notas</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EditableField
            label="Email de facturacion"
            value={tenant.billingEmail || ''}
            onSave={(v) => onPatch({ billingEmail: v })}
          />
          <EditableField
            label="Email de soporte"
            value={tenant.supportEmail || ''}
            onSave={(v) => onPatch({ supportEmail: v })}
          />
          <div className="sm:col-span-2">
            <EditableField
              label="Notas"
              value={tenant.notes || ''}
              onSave={(v) => onPatch({ notes: v })}
              multiline
            />
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Acciones</h3>
        <div className="flex gap-3">
          {tenant.active ? (
            <button
              onClick={onSuspend}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Suspender tenant
            </button>
          ) : (
            <button
              onClick={onReactivate}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Reactivar tenant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Administradores ──

function AdminsTab({ admins }: { admins: TenantAdmin[] }) {
  if (admins.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6 text-center text-gray-500 dark:text-gray-400">
        No hay administradores registrados.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Nombre
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Rol
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Estado
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
              Ultimo login
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {admins.map((admin) => (
            <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                {admin.name}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {admin.email}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  {admin.role}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    admin.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {admin.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {admin.lastLoginAt
                  ? new Date(admin.lastLoginAt).toLocaleDateString('es-CL')
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Metricas ──

function MetricsTab({
  metrics,
  plan,
  admins,
}: {
  metrics: TenantMetrics;
  plan: TenantPlan;
  admins: TenantAdmin[];
}) {
  return (
    <div className="space-y-6">
      {/* Progress bars */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Uso de recursos</h3>
        <div className="space-y-4">
          <ProgressBar
            label="Guardias activos"
            value={metrics.activeGuards}
            max={plan.maxGuards}
          />
          <ProgressBar
            label="Administradores"
            value={admins.length}
            max={plan.maxAdmins}
          />
        </div>
      </div>

      {/* Activity stats */}
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Actividad (ultimos 30 dias)
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4 text-center">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Marcaciones</dt>
            <dd className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.marcaciones30d.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4 text-center">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Documentos</dt>
            <dd className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.documentos30d.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 dark:border-gray-800 p-4 text-center">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Rondas</dt>
            <dd className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {metrics.rondas30d.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
