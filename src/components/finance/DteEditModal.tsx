"use client";

/**
 * DteEditModal — envuelve <DteForm> para editar un borrador sin salir de
 * Programación (o cualquier lista de borradores). Replica el editor de
 * /finanzas/facturacion/emitir?draftId=… en un Dialog a pantalla casi completa.
 *
 * Misma lógica de guardado/emisión que la página; al terminar cierra el modal
 * y deja que el caller refresque la lista/detalle.
 */

import { Suspense, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { DteForm } from "./DteForm";

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  open: boolean;
  draftId: string | null;
  onClose: () => void;
  /** Tras guardar el borrador (sin emitir). */
  onSaved?: () => void;
  /** Tras emitir al SII — el borrador deja de existir. */
  onIssued?: () => void;
}

const AVAILABLE_TYPES = [33, 34];

function flattenAcceptingAccounts(nodes: unknown[]): AccountOption[] {
  const out: AccountOption[] = [];
  const walk = (list: unknown[]) => {
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const n = raw as {
        id?: string;
        code?: string;
        name?: string;
        isActive?: boolean;
        acceptsEntries?: boolean;
        children?: unknown[];
      };
      if (n.isActive && n.acceptsEntries && n.id && n.code && n.name) {
        out.push({ id: n.id, code: n.code, name: n.name });
      }
      if (Array.isArray(n.children) && n.children.length > 0) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function DteEditModal({
  open,
  draftId,
  onClose,
  onSaved,
  onIssued,
}: Props) {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open || !draftId) {
      setReady(false);
      return;
    }
    let alive = true;
    setReady(false);
    // Plan de cuentas es opcional (import de ítems pendientes). Si el usuario
    // no tiene accounting_view, seguimos con [] — editar/emitir el borrador
    // no depende de esto.
    fetch("/api/finance/accounting/accounts")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const tree = Array.isArray(j?.data) ? j.data : [];
        setAccounts(flattenAcceptingAccounts(tree));
      })
      .catch(() => {
        if (alive) setAccounts([]);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [open, draftId]);

  return (
    <Dialog
      open={open && !!draftId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        overlayClassName="z-[60]"
        className="z-[60] sm:max-w-4xl sm:max-h-[92dvh] max-h-[95dvh] w-[100vw] p-0 gap-0 overflow-hidden flex flex-col"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-ds-border-subtle shrink-0 pr-12">
          <DialogTitle>Editar borrador</DialogTitle>
          <DialogDescription className="text-[12px] text-ds-text-3">
            Mismo editor que Emitir DTE. Guardá para actualizar o emití al SII.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
          {!ready || !draftId ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-ds-text-3" />
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-ds-text-3" />
                </div>
              }
            >
              <DteForm
                key={draftId}
                availableTypes={AVAILABLE_TYPES}
                accounts={accounts}
                draftId={draftId}
                onCancel={onClose}
                onSaved={() => {
                  onClose();
                  onSaved?.();
                }}
                onIssued={() => {
                  onClose();
                  onIssued?.();
                }}
              />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
