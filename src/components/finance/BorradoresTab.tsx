"use client";

/**
 * Tab "Borradores" del módulo Facturación.
 *
 * Lista los DTEs en estado DRAFT (no emitidos al SII) Y las plantillas
 * recurrentes que generan borradores automáticamente. Las dos secciones
 * conviven en un solo tab para que el usuario tenga una sola "bandeja
 * de programación" donde ve qué hay pendiente y qué se va a generar.
 *
 * Permite editar, emitir directo (con modal de confirmación), o eliminar
 * cada borrador individual; y enlaza a `/finanzas/facturacion/recurrentes`
 * para gestionar plantillas recurrentes.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, FileEdit, Send, Trash2, Loader2, Repeat, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EmisionConfirmDialog } from "./EmisionConfirmDialog";
import Link from "next/link";

type DraftDte = {
  id: string;
  dteType: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail: string | null;
  netAmount: number | string;
  taxAmount: number | string;
  totalAmount: number | string;
  currency: string;
  ufValueAtIssue?: number | string | null;
  updatedAt: string;
  lines?: Array<{ itemName: string; quantity: number | string; unitPrice: number | string; unitPriceUf?: number | string | null }>;
};

type RecurringTemplate = {
  id: string;
  name: string;
  isActive: boolean;
  dteType: number;
  receiverName: string;
  receiverRut: string;
  currency: string;
  frequency: string;
  nextRunAt: string | null;
  runCount: number;
};

const DTE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

function fmt(n: number | string): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `$${Math.round(v || 0).toLocaleString("es-CL")}`;
}

export function BorradoresTab({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<DraftDte[]>([]);
  const [recurring, setRecurring] = React.useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmDraft, setConfirmDraft] = React.useState<DraftDte | null>(null);
  const [tenantBackoffice, setTenantBackoffice] = React.useState<{ emails: string[]; alwaysSend: boolean }>({
    emails: [],
    alwaysSend: false,
  });
  const [issuing, setIssuing] = React.useState(false);

  const reload = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/finance/billing/drafts?pageSize=100").then((r) => r.json()),
      fetch("/api/finance/billing/recurring").then((r) => r.json()),
    ])
      .then(([draftsJson, recurringJson]) => {
        if (draftsJson?.success) setDrafts(draftsJson.data?.drafts ?? []);
        if (recurringJson?.success) {
          setRecurring(recurringJson.data?.templates ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    reload();
    fetch("/api/finance/config/dte-provider")
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.data?.config;
        if (cfg) {
          setTenantBackoffice({
            emails: cfg.defaultXmlRecipientEmails ?? [],
            alwaysSend: !!cfg.defaultXmlRecipientAlwaysSend,
          });
        }
      })
      .catch(() => {});
  }, [reload]);

  const FREQ_LABELS: Record<string, string> = {
    monthly: "Mensual",
    biweekly: "Quincenal",
    weekly: "Semanal",
    yearly: "Anual",
  };
  const DTE_LABELS_RECURRING: Record<number, string> = {
    33: "Factura",
    34: "Factura Exenta",
  };
  const activeRecurring = recurring.filter((t) => t.isActive);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este borrador? Esta acción no es reversible.")) return;
    const res = await fetch(`/api/finance/billing/drafts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Borrador eliminado");
      reload();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "Error al eliminar borrador");
    }
  };

  const handleIssueConfirmed = async (opts: { autoSendEmail: boolean; sendXmlToBackoffice: boolean }) => {
    if (!confirmDraft) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${confirmDraft.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Error al emitir borrador");
      }
      toast.success("Borrador emitido al SII");
      setConfirmDraft(null);
      reload();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sección 1: Plantillas recurrentes (cron genera borradores) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Repeat className="h-5 w-5 text-tint-violet-fg" />
              Facturación recurrente
            </h2>
            <p className="text-sm text-muted-foreground">
              Plantillas que generan borradores automáticamente. El cron NO emite directo al SII —
              siempre revisas el borrador antes de emitir.
            </p>
          </div>
          {canManage && (
            <Button asChild variant="outline" size="sm">
              <Link href="/finanzas/facturacion/recurrentes">
                <ExternalLink className="size-4 mr-1.5" />
                Gestionar plantillas
              </Link>
            </Button>
          )}
        </div>
        <Card>
          <CardContent className="pt-4">
            {activeRecurring.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No hay plantillas recurrentes activas.{" "}
                {canManage && (
                  <Link
                    href="/finanzas/facturacion/recurrentes"
                    className="text-primary hover:underline"
                  >
                    Crear una →
                  </Link>
                )}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">Plantilla</th>
                      <th className="py-2 text-left">Frecuencia</th>
                      <th className="py-2 text-left">Próxima ejecución</th>
                      <th className="py-2 text-right">Corridas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRecurring.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-muted/40">
                        <td className="py-2">
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {DTE_LABELS_RECURRING[t.dteType] ?? `Tipo ${t.dteType}`} ·{" "}
                            {t.receiverName} · {t.currency}
                          </div>
                        </td>
                        <td className="py-2 text-xs">
                          {FREQ_LABELS[t.frequency] ?? t.frequency}
                        </td>
                        <td className="py-2 text-xs">
                          {t.nextRunAt
                            ? new Date(t.nextRunAt).toLocaleDateString("es-CL", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-2 text-right text-xs">{t.runCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sección 2: Borradores libres */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileEdit className="h-5 w-5 text-status-info-fg" />
            Borradores libres
          </h2>
          <p className="text-sm text-muted-foreground">
            DTEs guardados sin emitir al SII. No generan asiento contable ni reservan folio.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => router.push("/finanzas/facturacion/emitir?asDraft=true")}>
            <Plus className="size-4 mr-1.5" />
            Nuevo borrador
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : drafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay borradores. Cuando guardes un DTE como borrador aparecerá acá.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Tipo</th>
                    <th className="py-2 text-left">Receptor</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-left">Moneda</th>
                    <th className="py-2 text-left">Actualizado</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.id} className="border-b hover:bg-muted/40">
                      <td className="py-2">{DTE_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}</td>
                      <td className="py-2">
                        <div className="font-medium">{d.receiverName || "(sin receptor)"}</div>
                        <div className="text-xs text-muted-foreground">{d.receiverRut || "—"}</div>
                      </td>
                      <td className="py-2 text-right">{fmt(d.totalAmount)}</td>
                      <td className="py-2">{d.currency}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {new Date(d.updatedAt).toLocaleString("es-CL")}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/finanzas/facturacion/emitir?draftId=${d.id}`)}
                            title="Editar"
                          >
                            <FileEdit className="size-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDraft(d)}
                                title="Emitir ahora"
                              >
                                <Send className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(d.id)}
                                title="Eliminar"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmDraft && (
        <EmisionConfirmDialog
          open={!!confirmDraft}
          onClose={() => setConfirmDraft(null)}
          onConfirm={handleIssueConfirmed}
          loading={issuing}
          dteType={confirmDraft.dteType}
          receiver={{
            name: confirmDraft.receiverName,
            rut: confirmDraft.receiverRut,
            email: confirmDraft.receiverEmail,
          }}
          totals={{
            netAmount: Number(confirmDraft.netAmount),
            taxAmount: Number(confirmDraft.taxAmount),
            totalAmount: Number(confirmDraft.totalAmount),
            currency: confirmDraft.currency as "CLP" | "UF",
            ufValue: confirmDraft.ufValueAtIssue ? Number(confirmDraft.ufValueAtIssue) : undefined,
          }}
          lines={(confirmDraft.lines ?? []).map((l) => ({
            itemName: l.itemName,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            unitPriceUf: l.unitPriceUf != null ? Number(l.unitPriceUf) : null,
          }))}
          defaultBackofficeEmails={tenantBackoffice.emails}
          defaultBackofficeAlwaysSend={tenantBackoffice.alwaysSend}
        />
      )}
    </div>
  );
}
