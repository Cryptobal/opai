"use client";

/**
 * CreditNoteModal — modal que envuelve <CreditNoteForm> para emitir
 * NC (Nota de Crédito) o ND (Nota de Débito) referenciando un DTE
 * existente. Reemplaza el flujo anterior que abría una página completa
 * (/finanzas/facturacion/notas/credito?referenceDteId=X).
 *
 * Comportamiento:
 *   - Carga el DTE referenciado vía /api/finance/billing/issued/[id]
 *     al abrir el modal (incluye líneas para que el form las pueda
 *     pre-llenar).
 *   - Loading state mientras carga el DTE.
 *   - Error state si el DTE no existe o no está autorizado.
 *   - Al éxito de emisión, el form llama router.push("/finanzas/facturacion")
 *     pero como estamos en esa página, basta cerrar el modal y refrescar.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { CreditNoteForm } from "./CreditNoteForm";

interface ReferenceDte {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail?: string | null;
  accountId?: string | null;
  totalAmount: number;
  lines: {
    itemName: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** ID del DTE que se va a referenciar (factura, boleta, NC, etc). */
  referenceDteId: string | null;
  /** Tipo de nota a emitir. */
  noteType: "credit" | "debit";
}

export function CreditNoteModal({ open, onClose, referenceDteId, noteType }: Props) {
  const router = useRouter();
  const [referenceDte, setReferenceDte] = useState<ReferenceDte | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !referenceDteId) {
      setReferenceDte(null);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/finance/billing/issued/${referenceDteId}`, { signal: ctrl.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const d = json.data;
        setReferenceDte({
          id: d.id,
          dteType: d.dteType,
          folio: d.folio,
          receiverRut: d.receiverRut,
          receiverName: d.receiverName,
          receiverEmail: d.receiverEmail ?? null,
          accountId: d.accountId ?? null,
          totalAmount: Number(d.totalAmount),
          lines: Array.isArray(d.lines)
            ? d.lines.map((l: Record<string, unknown>) => ({
                itemName: String(l.itemName ?? ""),
                description: (l.description as string | null) ?? null,
                quantity: Number(l.quantity),
                unitPrice: Number(l.unitPrice),
              }))
            : [],
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message ?? "Error al cargar el DTE referenciado");
        }
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [open, referenceDteId]);

  // El form usa router.push internamente al guardar. Hookeamos eso a través
  // de un onSuccess callback (el form ya hace router.push("/finanzas/facturacion")
  // que es la misma página, así que basta con cerrar y refrescar).
  const handleAfterSuccess = () => {
    onClose();
    router.refresh();
  };

  const noteTypeName = noteType === "credit" ? "Nota de Crédito" : "Nota de Débito";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Emitir {noteTypeName}
            {referenceDte && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · referencia: tipo {referenceDte.dteType} folio {referenceDte.folio}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="py-8 text-center">
            <p className="text-status-danger-fg font-medium">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Verificá que el DTE exista y que tengas permisos para verlo.
            </p>
          </div>
        )}

        {!loading && !error && referenceDte && (
          <CreditNoteForm
            noteType={noteType}
            referenceDte={referenceDte}
            onSuccess={handleAfterSuccess}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
