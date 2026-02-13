"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  CheckCircle2,
  XCircle,
  Search,
  Receipt,
  Car,
  Loader2,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface PendingApproval {
  approvalId: string;
  rendicionId: string;
  code: string;
  type: string;
  amount: number;
  date: string;
  description: string | null;
  status: string;
  itemName: string | null;
  costCenterName: string | null;
  submitterName: string;
  submittedAt: string | null;
  approvalOrder: number;
}

interface AprobacionesClientProps {
  pendingApprovals: PendingApproval[];
}

/* ── Constants ── */

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  MILEAGE: "Kilometraje",
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function AprobacionesClient({
  pendingApprovals,
}: AprobacionesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return pendingApprovals;
    const q = search.toLowerCase();
    return pendingApprovals.filter(
      (a) =>
        a.code.toLowerCase().includes(q) ||
        a.submitterName.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.itemName?.toLowerCase().includes(q)
    );
  }, [pendingApprovals, search]);

  /* ── Actions ── */

  const handleApprove = useCallback(
    async (rendicionId: string) => {
      setLoadingAction(`approve-${rendicionId}`);
      try {
        const res = await fetch(`/api/finance/rendiciones/${rendicionId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res
          .json()
          .catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Error al aprobar");
        toast.success("Rendición aprobada");
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al aprobar"
        );
      } finally {
        setLoadingAction(null);
      }
    },
    [router]
  );

  const openRejectDialog = useCallback((rendicionId: string) => {
    setRejectTarget(rendicionId);
    setRejectReason("");
    setRejectDialogOpen(true);
  }, []);

  const handleReject = useCallback(async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Ingresa un motivo de rechazo.");
      return;
    }
    setLoadingAction(`reject-${rejectTarget}`);
    try {
      const res = await fetch(`/api/finance/rendiciones/${rejectTarget}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = (await res
        .json()
        .catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Error al rechazar");
      toast.success("Rendición rechazada");
      setRejectDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al rechazar"
      );
    } finally {
      setLoadingAction(null);
    }
  }, [rejectTarget, rejectReason, router]);

  /* ── Totals ── */

  const totalAmount = useMemo(
    () => pendingApprovals.reduce((sum, a) => sum + a.amount, 0),
    [pendingApprovals]
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pendientes</p>
            <p className="text-lg font-semibold">{pendingApprovals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Monto total</p>
            <p className="text-lg font-semibold tabular-nums">
              {fmtCLP.format(totalAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar código, nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="Sin aprobaciones pendientes"
          description={
            search.trim()
              ? "No se encontraron resultados con esa búsqueda."
              : "No tienes rendiciones pendientes de aprobación."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const isApproving = loadingAction === `approve-${a.rendicionId}`;
            const isRejecting = loadingAction === `reject-${a.rendicionId}`;
            return (
              <Card key={a.approvalId} className="overflow-hidden">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Info */}
                    <Link
                      href={`/finanzas/rendiciones/${a.rendicionId}`}
                      className="flex-1 min-w-0 group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">
                          {a.code}
                        </span>
                        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                          Paso {a.approvalOrder}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                        {a.description || a.itemName || TYPE_LABELS[a.type]}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {a.type === "MILEAGE" ? (
                            <Car className="h-3 w-3" />
                          ) : (
                            <Receipt className="h-3 w-3" />
                          )}
                          {TYPE_LABELS[a.type]}
                        </span>
                        <span>
                          {format(new Date(a.date), "dd MMM yyyy", {
                            locale: es,
                          })}
                        </span>
                        <span>{a.submitterName}</span>
                        {a.costCenterName && <span>{a.costCenterName}</span>}
                      </div>
                    </Link>

                    {/* Amount + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold tabular-nums min-w-[80px] text-right">
                        {fmtCLP.format(a.amount)}
                      </p>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApprove(a.rendicionId)}
                          disabled={isApproving || isRejecting}
                          className="bg-emerald-600 hover:bg-emerald-700 h-8 px-3"
                        >
                          {isApproving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openRejectDialog(a.rendicionId)}
                          disabled={isApproving || isRejecting}
                          className="text-red-400 hover:text-red-300 h-8 px-3"
                        >
                          {isRejecting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar rendición</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rejectReasonApproval">Motivo del rechazo</Label>
              <textarea
                id="rejectReasonApproval"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe por qué se rechaza..."
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRejectDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleReject}
                disabled={!!loadingAction}
                className="bg-red-600 hover:bg-red-700"
              >
                {loadingAction?.startsWith("reject") ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1.5" />
                )}
                Confirmar rechazo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
