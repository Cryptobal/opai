"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/opai";
import {
  Wallet,
  Plus,
  Download,
  Search,
  Loader2,
  CreditCard,
  Landmark,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface PaymentRendicion {
  id: string;
  code: string;
  amount: number;
  submitterName: string;
}

interface Payment {
  id: string;
  code: string;
  type: string;
  totalAmount: number;
  rendicionCount: number;
  paidByName: string;
  paidAt: string;
  bankFileName: string | null;
  bankFileUrl: string | null;
  notes: string | null;
  rendiciones: PaymentRendicion[];
}

interface PendingRendicion {
  id: string;
  code: string;
  amount: number;
  date: string;
  submitterName: string;
  itemName: string | null;
  costCenterName: string | null;
}

interface PagosClientProps {
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
}

/* ── Constants ── */

const TYPE_LABELS: Record<string, string> = {
  BATCH_SANTANDER: "Santander",
  MANUAL: "Manual",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

function extractFilenameFromDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? fallback;
}

/* ── Component ── */

export function PagosClient({ payments, pendingRendiciones }: PagosClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pending" | "history">(
    pendingRendiciones.length > 0 ? "pending" : "history"
  );
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [paymentType, setPaymentType] = useState("MANUAL");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  /* ── Selection ── */

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === pendingRendiciones.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRendiciones.map((r) => r.id)));
    }
  }, [pendingRendiciones, selectedIds.size]);

  const selectedAmount = useMemo(
    () =>
      pendingRendiciones
        .filter((r) => selectedIds.has(r.id))
        .reduce((sum, r) => sum + r.amount, 0),
    [pendingRendiciones, selectedIds]
  );

  /* ── Filtered lists ── */

  const filteredPayments = useMemo(() => {
    if (!search.trim()) return payments;
    const q = search.toLowerCase();
    return payments.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.paidByName.toLowerCase().includes(q) ||
        p.notes?.toLowerCase().includes(q)
    );
  }, [payments, search]);

  /* ── Actions ── */

  const handleCreatePayment = useCallback(async () => {
    if (selectedIds.size === 0) {
      toast.error("Selecciona al menos una rendición.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: paymentType,
          rendicionIds: Array.from(selectedIds),
          notes: paymentNotes || undefined,
        }),
      });

      const data = (await res
        .json()
        .catch(() => ({}))) as {
        error?: string;
        data?: { id?: string; code?: string };
      };
      if (!res.ok) throw new Error(data.error || "Error al crear pago");

      const paymentId = data.data?.id;
      const paymentCode = data.data?.code ?? "sin-codigo";

      if (paymentType === "BATCH_SANTANDER" && paymentId) {
        const exportRes = await fetch(
          `/api/finance/payments/${paymentId}/export-santander`,
          { method: "GET" }
        );
        if (!exportRes.ok) {
          const exportData = (await exportRes
            .json()
            .catch(() => ({}))) as { error?: string };
          toast.success(
            `Pago ${paymentCode} creado con ${selectedIds.size} rendición(es)`
          );
          throw new Error(
            exportData.error ||
              "Pago creado, pero no se pudo descargar el archivo Santander"
          );
        }

        const blob = await exportRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = extractFilenameFromDisposition(
          exportRes.headers.get("Content-Disposition"),
          `${paymentCode}-santander.xlsx`
        );
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast.success(
          `Pago ${paymentCode} creado y archivo Santander descargado`
        );
      } else {
        toast.success(
          `Pago ${paymentCode} creado con ${selectedIds.size} rendición(es)`
        );
      }

      setCreateDialogOpen(false);
      setSelectedIds(new Set());
      setPaymentNotes("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear pago");
    } finally {
      setCreating(false);
    }
  }, [selectedIds, paymentType, paymentNotes, router]);

  const handleExportSantander = useCallback(
    async (paymentId: string) => {
      setExportingId(paymentId);
      try {
        const res = await fetch(
          `/api/finance/payments/${paymentId}/export-santander`,
          { method: "GET" }
        );
        if (!res.ok) {
          const data = (await res
            .json()
            .catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Error al exportar");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = extractFilenameFromDisposition(
          res.headers.get("Content-Disposition"),
          `pago_santander_${paymentId}.xlsx`
        );
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Archivo Santander descargado");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al exportar");
      } finally {
        setExportingId(null);
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">
              Pendientes de pago
            </p>
            <p className="text-lg font-semibold">{pendingRendiciones.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Monto pendiente</p>
            <p className="text-lg font-semibold tabular-nums">
              {fmtCLP.format(
                pendingRendiciones.reduce((s, r) => s + r.amount, 0)
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pagos realizados</p>
            <p className="text-lg font-semibold">{payments.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {[
          {
            value: "pending" as const,
            label: "Pendientes",
            count: pendingRendiciones.length,
          },
          {
            value: "history" as const,
            label: "Historial",
            count: payments.length,
          },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
              activeTab === tab.value
                ? "bg-primary/15 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                activeTab === tab.value
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Pending tab */}
      {activeTab === "pending" && (
        <div className="space-y-3">
          {pendingRendiciones.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-10 w-10" />}
              title="Sin rendiciones pendientes de pago"
              description="Las rendiciones aprobadas aparecerán aquí."
            />
          ) : (
            <>
              {/* Bulk actions */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAll}
                    className="text-xs"
                  >
                    {selectedIds.size === pendingRendiciones.length ? (
                      <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Square className="h-3.5 w-3.5 mr-1" />
                    )}
                    {selectedIds.size === pendingRendiciones.length
                      ? "Deseleccionar todo"
                      : "Seleccionar todo"}
                  </Button>
                  {selectedIds.size > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {selectedIds.size} seleccionada(s) ={" "}
                      <span className="font-medium text-foreground">
                        {fmtCLP.format(selectedAmount)}
                      </span>
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCreateDialogOpen(true)}
                  disabled={selectedIds.size === 0}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Crear pago ({selectedIds.size})
                </Button>
              </div>

              {/* Pending list */}
              <div className="space-y-1.5">
                {pendingRendiciones.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleSelect(r.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/5"
                          : "border-border hover:bg-accent/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3 text-primary-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {r.code}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {r.submitterName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span>
                              {format(new Date(r.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            {r.itemName && (
                              <>
                                <span>·</span>
                                <span>{r.itemName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-medium tabular-nums shrink-0">
                          {fmtCLP.format(r.amount)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pago..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {filteredPayments.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-10 w-10" />}
              title="Sin pagos registrados"
              description="Los pagos procesados aparecerán aquí."
            />
          ) : (
            <div className="space-y-2">
              {filteredPayments.map((p) => {
                const isExpanded = expandedPayment === p.id;
                return (
                  <Card key={p.id}>
                    <CardContent className="pt-4 pb-4">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPayment(isExpanded ? null : p.id)
                        }
                        className="w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono text-xs">
                                {p.code}
                              </span>
                              <Badge
                                className={cn(
                                  "text-[10px]",
                                  p.type === "BATCH_SANTANDER"
                                    ? "bg-blue-500/15 text-blue-400"
                                    : "bg-zinc-500/15 text-zinc-400"
                                )}
                              >
                                {TYPE_LABELS[p.type] ?? p.type}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {format(
                                  new Date(p.paidAt),
                                  "dd MMM yyyy HH:mm",
                                  { locale: es }
                                )}
                              </span>
                              <span>{p.rendicionCount} rendición(es)</span>
                              <span>por {p.paidByName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-semibold tabular-nums">
                              {fmtCLP.format(p.totalAmount)}
                            </p>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border space-y-2">
                          {p.notes && (
                            <p className="text-xs text-muted-foreground italic mb-2">
                              {p.notes}
                            </p>
                          )}
                          <div className="space-y-1">
                            {p.rendiciones.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between py-1 text-xs"
                              >
                                <span className="text-muted-foreground">
                                  {r.code} — {r.submitterName}
                                </span>
                                <span className="tabular-nums">
                                  {fmtCLP.format(r.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-2">
                            {p.bankFileUrl && (
                              <a
                                href={p.bankFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button variant="outline" size="sm">
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Descargar archivo
                                </Button>
                              </a>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportSantander(p.id)}
                              disabled={exportingId === p.id}
                            >
                              {exportingId === p.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Landmark className="h-3.5 w-3.5 mr-1" />
                              )}
                              Export Santander
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create payment dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Rendiciones</span>
                <span>{selectedIds.size}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Monto total</span>
                <span className="font-semibold">
                  {fmtCLP.format(selectedAmount)}
                </span>
              </div>
            </div>

            <div>
              <Label>Tipo de pago</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPaymentType("MANUAL")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors text-sm",
                    paymentType === "MANUAL"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/30"
                  )}
                >
                  <CreditCard className="h-4 w-4" />
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("BATCH_SANTANDER")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-3 text-left transition-colors text-sm",
                    paymentType === "BATCH_SANTANDER"
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent/30"
                  )}
                >
                  <Landmark className="h-4 w-4" />
                  Santander
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="paymentNotes">Notas (opcional)</Label>
              <textarea
                id="paymentNotes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                rows={2}
                placeholder="Observaciones del pago..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleCreatePayment} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4 mr-1.5" />
                )}
                Crear pago
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
