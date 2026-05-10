'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Clock, ExternalLink } from 'lucide-react';
import { TenantTable, type TenantRow } from '@/components/platform/TenantTable';
import { DeleteTenantModal } from '@/components/platform/DeleteTenantModal';

interface PendingSignup {
  id: string;
  email: string;
  ownerName: string;
  commercialName: string;
  proposedSlug: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  resentCount: number;
  requiresReview: boolean;
}

export default function TenantsListPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [pending, setPending] = useState<PendingSignup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<TenantRow | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        fetch('/api/platform/dashboard'),
        fetch('/api/platform/pending-signups'),
      ]);

      if (!tRes.ok) {
        router.push('/platform/login');
        return;
      }

      const tJson = await tRes.json();
      setTenants(tJson.tenants);

      if (pRes.ok) {
        const pJson = await pRes.json();
        setPending(pJson.pendingSignups);
      } else {
        setPending([]);
      }
    } catch {
      router.push('/platform/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}/impersonate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.location.href = data.redirectTo || '/hub';
    } catch {
      alert('No se pudo iniciar sesión como este tenant.');
    }
  };

  const handleDeletePending = async (id: string, email: string) => {
    if (
      !confirm(
        `¿Eliminar el registro pendiente de ${email}?\n\nEsto permite que el usuario se registre nuevamente con el mismo email.`,
      )
    )
      return;
    const res = await fetch(`/api/platform/pending-signups?id=${id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      fetchAll();
    } else {
      const data = await res.json();
      alert(data.error || 'No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Todos los tenants creados en la plataforma. Pendientes de
            verificación abajo.
          </p>
        </div>
        <Link
          href="/platform/tenants/new"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:brightness-110 dark:bg-gray-100 dark:text-gray-900"
        >
          <Plus className="h-4 w-4" />
          Nuevo tenant
        </Link>
      </div>

      {loading || !tenants ? (
        <div className="h-96 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
      ) : (
        <TenantTable
          tenants={tenants}
          onImpersonate={handleImpersonate}
          onDelete={(t) => setDeleteModal(t)}
        />
      )}

      {pending && pending.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-status-warn-fg" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Registros pendientes de verificación
              </h2>
              <span className="ml-auto text-xs text-gray-400">
                {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Slug propuesto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Creado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {pending.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {p.commercialName}
                      </div>
                      <div className="text-xs text-gray-400">{p.ownerName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {p.email}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {p.proposedSlug}
                    </td>
                    <td className="px-4 py-3">
                      {p.isExpired ? (
                        <span className="inline-flex rounded-full bg-status-danger-soft px-2 py-0.5 text-xs font-medium text-status-danger-fg">
                          Expirado
                        </span>
                      ) : p.requiresReview ? (
                        <span className="inline-flex rounded-full bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn-fg">
                          Revisión
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-status-info-soft px-2 py-0.5 text-xs font-medium text-status-info-fg">
                          Esperando email
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(p.createdAt).toLocaleString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeletePending(p.id, p.email)}
                        className="rounded-md bg-status-danger-soft px-3 py-1.5 text-xs font-medium text-status-danger-fg hover:brightness-110"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <ExternalLink className="mr-1 inline h-3 w-3" />
            Eliminar un registro pendiente permite que el mismo email se
            registre de nuevo desde cero.
          </div>
        </div>
      )}

      {deleteModal && (
        <DeleteTenantModal
          open={!!deleteModal}
          tenantId={deleteModal.id}
          tenantSlug={deleteModal.slug}
          tenantName={deleteModal.name}
          onClose={() => setDeleteModal(null)}
          onDeleted={() => {
            setDeleteModal(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}
