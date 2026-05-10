'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteTenantModalProps {
  open: boolean;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteTenantModal({
  open,
  tenantId,
  tenantSlug,
  tenantName,
  onClose,
  onDeleted,
}: DeleteTenantModalProps) {
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setConfirmation('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const canDelete = confirmation.trim() === tenantSlug && !submitting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/platform/tenants/${tenantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al eliminar el tenant');
        setSubmitting(false);
        return;
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-tenant-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-status-danger-border bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-gray-100 p-6 dark:border-gray-800">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-status-danger-soft p-2">
              <AlertTriangle className="h-5 w-5 text-status-danger-fg" />
            </div>
            <div>
              <h2
                id="delete-tenant-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Eliminar tenant
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {tenantName}{' '}
                <span className="font-mono">({tenantSlug})</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-gray-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-4">
            <p className="text-sm font-semibold text-status-danger-fg">
              Esta acción es irreversible.
            </p>
            <p className="mt-2 text-sm text-status-danger-fg">
              Se eliminarán permanentemente:
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-status-danger-fg">
              <li>Todos los administradores y usuarios</li>
              <li>Todos los guardias, instalaciones y puestos operativos</li>
              <li>Todo el CRM (leads, accounts, deals, tasks, emails)</li>
              <li>Toda la nómina (liquidaciones, periodos, asistencia)</li>
              <li>Cotizaciones y propuestas</li>
              <li>Todos los datos del tenant en todos los módulos</li>
            </ul>
          </div>

          <div>
            <label
              htmlFor="confirm-slug"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Para confirmar, escribe{' '}
              <span className="font-mono font-bold">{tenantSlug}</span> abajo:
            </label>
            <input
              id="confirm-slug"
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={submitting}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-status-danger focus:outline-none focus:ring-1 focus:ring-status-danger disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              placeholder={tenantSlug}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-3 text-sm text-status-danger-fg">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 rounded-b-xl border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="rounded-lg bg-status-danger px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Eliminando…' : 'Eliminar tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}
