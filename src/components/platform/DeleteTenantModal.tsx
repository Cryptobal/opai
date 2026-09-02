'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-tenant-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-status-danger-border bg-ds-surface-1 shadow-ds-lg">
        <div className="flex items-start justify-between border-b border-ds-border-subtle p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-status-danger-soft p-2">
              <AlertTriangle className="h-5 w-5 text-status-danger-fg" />
            </div>
            <div>
              <h2 id="delete-tenant-title" className="font-display text-lg text-ds-text-1">
                Eliminar tenant
              </h2>
              <p className="mt-1 text-[13px] text-ds-text-3">
                {tenantName}{' '}
                <span className="font-mono">({tenantSlug})</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-2 text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-4">
            <p className="text-[13px] font-semibold text-status-danger-fg">Esta acción es irreversible.</p>
            <p className="mt-2 text-[13px] text-status-danger-fg">Se eliminarán permanentemente todos los datos del tenant.</p>
          </div>
          <div>
            <label htmlFor="confirm-slug" className="block text-[13px] text-ds-text-2">
              Para confirmar, escribe <span className="font-mono font-medium">{tenantSlug}</span>:
            </label>
            <Input
              id="confirm-slug"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={submitting}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mt-2 h-10 sm:h-9 font-mono"
              placeholder={tenantSlug}
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-soft p-3 text-[13px] text-status-danger-fg">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-ds-border-subtle px-6 py-4">
          <Button type="button" variant="secondary" className="h-10 sm:h-9" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" className="h-10 sm:h-9" onClick={handleDelete} disabled={!canDelete}>
            {submitting ? 'Eliminando…' : 'Eliminar tenant'}
          </Button>
        </div>
      </div>
    </div>
  );
}
