"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { FileText, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtCLP } from "@/components/finance/dtes/shared/constants";

type DraftRow = {
  id: string;
  date: string;
  createdAt: string;
  dteType: number;
  receiverName: string | null;
  receiverRut: string | null;
  totalAmount: number | string;
};

export function DraftsList({ canIssue }: { canIssue: boolean }) {
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);

  async function loadDrafts() {
    try {
      // El endpoint `GET /api/finance/billing/drafts` ya existe (creado para
      // la lista paginada del módulo Facturación). Le pedimos pageSize alto
      // para cubrir todos los borradores del tenant en una vista simple.
      const res = await fetch("/api/finance/billing/drafts?pageSize=100");
      const json = await res.json();
      if (json.success) {
        setDrafts(json.data?.drafts ?? []);
      } else {
        toast.error(json.error ?? "Error cargando borradores");
        setDrafts([]);
      }
    } catch {
      toast.error("Error de conexión");
      setDrafts([]);
    }
  }

  useEffect(() => {
    loadDrafts();
  }, []);

  async function handleIssue(id: string) {
    if (!canIssue) return;
    setIssuing(id);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Borrador emitido al SII");
        await loadDrafts();
      } else {
        toast.error(json.error ?? "Error emitiendo");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setIssuing(null);
    }
  }

  if (drafts === null) {
    return (
      <div className="flex items-center gap-2 p-8 text-ds-text-3">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando borradores...
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-ds-text-3">
        <FileText className="h-8 w-8 opacity-40" />
        <p className="text-sm">No hay borradores pendientes de emitir.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ds-border-default overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-ds-surface-2 text-ds-text-3 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-left font-medium">Fecha doc</th>
            <th className="px-3 py-2 text-left font-medium">Generado</th>
            <th className="px-3 py-2 text-right font-medium">Monto</th>
            <th className="px-3 py-2 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((d) => (
            <tr key={d.id} className="border-t border-ds-border-default">
              <td className="px-3 py-2">
                <div className="font-medium text-ds-text-1">
                  {d.receiverName ?? "Sin cliente"}
                </div>
                {d.receiverRut && (
                  <div className="text-xs text-ds-text-3 font-mono">
                    {d.receiverRut}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-ds-text-2 font-mono text-xs">
                {format(new Date(d.date), "dd MMM yyyy", { locale: es })}
              </td>
              <td className="px-3 py-2 text-ds-text-3 font-mono text-xs">
                {format(new Date(d.createdAt), "dd MMM yyyy", { locale: es })}
              </td>
              <td className="px-3 py-2 text-right font-mono text-ds-text-1">
                {fmtCLP.format(Number(d.totalAmount))}
              </td>
              <td className="px-3 py-2 text-right">
                {canIssue ? (
                  <Button
                    size="sm"
                    variant="default"
                    disabled={issuing === d.id}
                    onClick={() => handleIssue(d.id)}
                  >
                    {issuing === d.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3 w-3 mr-1" />
                        Emitir
                      </>
                    )}
                  </Button>
                ) : (
                  <span className="text-xs text-ds-text-3">Sin permisos</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
