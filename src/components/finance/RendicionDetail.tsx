"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Receipt,
  Car,
  Edit,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Wallet,
  Clock,
  MapPin,
  FileText,
  Image as ImageIcon,
  Loader2,
  ArrowLeft,
  User,
  Calendar,
  DollarSign,
  Building2,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  publicUrl: string;
  attachmentType: string;
}

interface Approval {
  id: string;
  approverId: string;
  approverName: string;
  approvalOrder: number;
  decision: string | null;
  comment: string | null;
  decidedAt: string | null;
}

interface HistoryEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  userId: string;
  userName: string;
  comment: string | null;
  createdAt: string;
}

interface TripData {
  id: string;
  startLat: number;
  startLng: number;
  startAddress: string | null;
  startedAt: string;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
  endedAt: string | null;
  distanceKm: number | null;
  fuelCost: number | null;
  vehicleFee: number | null;
  tollAmount: number;
  totalAmount: number | null;
  status: string;
}

interface RendicionData {
  id: string;
  code: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  description: string | null;
  documentType: string | null;
  submitterId: string;
  submitterName: string;
  submittedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  rejectedByName: string | null;
  createdAt: string;
  item: { id: string; name: string; code: string | null } | null;
  costCenter: { id: string; name: string; code: string | null } | null;
  trip: TripData | null;
  approvals: Approval[];
  attachments: Attachment[];
  history: HistoryEvent[];
}

interface RendicionDetailProps {
  rendicion: RendicionData;
  permissions: {
    canApprove: boolean;
    canPay: boolean;
    canEdit: boolean;
    isOwner: boolean;
  };
}

type RendicionAction = "submit" | "approve" | "reject" | "resubmit" | "pay";

/* ── Constants ── */

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof Receipt }> = {
  DRAFT: { label: "Borrador", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: Edit },
  SUBMITTED: { label: "Enviada", className: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Send },
  IN_APPROVAL: { label: "En aprobación", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  APPROVED: { label: "Aprobada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  REJECTED: { label: "Rechazada", className: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
  PAID: { label: "Pagada", className: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: Wallet },
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Creada",
  SUBMITTED: "Enviada a aprobación",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  PAID: "Marcada como pagada",
  EDITED: "Editada",
  RESUBMITTED: "Reenviada",
};

const TYPE_LABELS: Record<string, string> = { PURCHASE: "Compra", MILEAGE: "Kilometraje" };
const DOC_TYPE_LABELS: Record<string, string> = { BOLETA: "Boleta", FACTURA: "Factura" };

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function RendicionDetail({ rendicion, permissions }: RendicionDetailProps) {
  const router = useRouter();
  const r = rendicion;
  const statusCfg = STATUS_CONFIG[r.status] ?? { label: r.status, className: "bg-muted", icon: Receipt };
  const StatusIcon = statusCfg.icon;

  const [loading, setLoading] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  /* ── Actions ── */

  const performAction = useCallback(
    async (action: RendicionAction, body?: Record<string, unknown>) => {
      setLoading(action);
      try {
        const requestJson = async (
          url: string,
          options?: { method?: "POST" | "PATCH"; body?: Record<string, unknown> }
        ) => {
          const res = await fetch(url, {
            method: options?.method ?? "POST",
            headers: { "Content-Type": "application/json" },
            ...(options?.body !== undefined
              ? { body: JSON.stringify(options.body) }
              : {}),
          });
          const payload = (await res
            .json()
            .catch(() => ({}))) as { error?: string; message?: string };
          if (!res.ok) {
            throw new Error(payload.error || "Error al ejecutar acción");
          }
          return payload;
        };

        let response: { message?: string } = {};
        switch (action) {
          case "submit":
            response = await requestJson(`/api/finance/rendiciones/${r.id}/submit`, {
              body: {},
            });
            break;
          case "approve":
            response = await requestJson(`/api/finance/rendiciones/${r.id}/approve`, {
              body: body?.comment ? { comment: body.comment } : {},
            });
            break;
          case "reject":
            response = await requestJson(`/api/finance/rendiciones/${r.id}/reject`, {
              body: { reason: body?.reason },
            });
            break;
          case "resubmit":
            // Rechazada -> DRAFT, luego se envía nuevamente a aprobación.
            await requestJson(`/api/finance/rendiciones/${r.id}`, {
              method: "PATCH",
              body: {},
            });
            response = await requestJson(`/api/finance/rendiciones/${r.id}/submit`, {
              body: {},
            });
            break;
          case "pay":
            await requestJson("/api/finance/payments", {
              body: { rendicionIds: [r.id], type: "MANUAL" },
            });
            response = { message: "Rendición marcada como pagada" };
            break;
        }

        const successByAction: Record<RendicionAction, string> = {
          submit: "Rendición enviada a aprobación",
          approve: "Rendición aprobada",
          reject: "Rendición rechazada",
          resubmit: "Rendición reenviada a aprobación",
          pay: "Rendición marcada como pagada",
        };
        toast.success(response.message || successByAction[action]);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setLoading(null);
      }
    },
    [r.id, router]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm("¿Eliminar esta rendición? Esta acción no se puede deshacer.")) return;
    setLoading("delete");
    try {
      const res = await fetch(`/api/finance/rendiciones/${r.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar");
      }
      toast.success("Rendición eliminada");
      router.push("/finanzas/rendiciones");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  }, [r.id, router]);

  const handleReject = useCallback(() => {
    if (!rejectReason.trim()) {
      toast.error("Ingresa un motivo de rechazo.");
      return;
    }
    performAction("reject", { reason: rejectReason });
    setRejectDialogOpen(false);
    setRejectReason("");
  }, [rejectReason, performAction]);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back link */}
      <Link
        href="/finanzas/rendiciones"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Volver a rendiciones
      </Link>

      {/* Status banner */}
      <Card className={cn("border-l-4", r.status === "REJECTED" ? "border-l-red-500" : r.status === "APPROVED" ? "border-l-emerald-500" : r.status === "PAID" ? "border-l-purple-500" : "border-l-blue-500")}>
        <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
              <p className="text-xs text-muted-foreground mt-1">
                Creada el{" "}
                {format(new Date(r.createdAt), "dd MMM yyyy 'a las' HH:mm", {
                  locale: es,
                })}
              </p>
            </div>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {fmtCLP.format(r.amount)}
          </p>
        </CardContent>
      </Card>

      {/* Rejection reason */}
      {r.status === "REJECTED" && r.rejectionReason && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Motivo de rechazo</p>
                <p className="text-sm text-muted-foreground mt-1">{r.rejectionReason}</p>
                {r.rejectedByName && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Rechazada por {r.rejectedByName}
                    {r.rejectedAt &&
                      ` el ${format(new Date(r.rejectedAt), "dd MMM yyyy", { locale: es })}`}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail grid */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow
              icon={FileText}
              label="Código"
              value={r.code}
            />
            <DetailRow
              icon={Calendar}
              label="Fecha"
              value={format(new Date(r.date), "dd MMMM yyyy", { locale: es })}
            />
            <DetailRow
              icon={r.type === "MILEAGE" ? Car : Receipt}
              label="Tipo"
              value={TYPE_LABELS[r.type] ?? r.type}
            />
            {r.documentType && (
              <DetailRow
                icon={FileText}
                label="Documento"
                value={DOC_TYPE_LABELS[r.documentType] ?? r.documentType}
              />
            )}
            <DetailRow
              icon={DollarSign}
              label="Monto"
              value={fmtCLP.format(r.amount)}
            />
            <DetailRow
              icon={User}
              label="Solicitante"
              value={r.submitterName}
            />
            {r.item && (
              <DetailRow
                icon={Tag}
                label="Ítem"
                value={`${r.item.name}${r.item.code ? ` (${r.item.code})` : ""}`}
              />
            )}
            {r.costCenter && (
              <DetailRow
                icon={Building2}
                label="Centro de costo"
                value={`${r.costCenter.name}${r.costCenter.code ? ` (${r.costCenter.code})` : ""}`}
              />
            )}
          </div>

          {r.description && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Descripción
              </p>
              <p className="text-sm whitespace-pre-wrap">{r.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trip details for mileage */}
      {r.trip && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-400" />
              Detalles del trayecto
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Inicio
                  </p>
                  <p className="text-sm">
                    {r.trip.startAddress ??
                      `${r.trip.startLat.toFixed(5)}, ${r.trip.startLng.toFixed(5)}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(r.trip.startedAt), "dd MMM yyyy HH:mm", {
                      locale: es,
                    })}
                  </p>
                </div>
                {r.trip.endLat != null && r.trip.endLng != null && (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Fin
                    </p>
                    <p className="text-sm">
                      {r.trip.endAddress ??
                        `${r.trip.endLat.toFixed(5)}, ${r.trip.endLng.toFixed(5)}`}
                    </p>
                    {r.trip.endedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(r.trip.endedAt), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Cost breakdown */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border space-y-1.5 text-sm">
                {r.trip.distanceKm != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Distancia</span>
                    <span>{r.trip.distanceKm} km</span>
                  </div>
                )}
                {r.trip.fuelCost != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Combustible</span>
                    <span>{fmtCLP.format(r.trip.fuelCost)}</span>
                  </div>
                )}
                {r.trip.vehicleFee != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee vehículo</span>
                    <span>{fmtCLP.format(r.trip.vehicleFee)}</span>
                  </div>
                )}
                {r.trip.tollAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peaje</span>
                    <span>{fmtCLP.format(r.trip.tollAmount)}</span>
                  </div>
                )}
                {r.trip.totalAmount != null && (
                  <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                    <span>Total trayecto</span>
                    <span className="text-emerald-400">
                      {fmtCLP.format(r.trip.totalAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attachments */}
      {r.attachments.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              Adjuntos ({r.attachments.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {r.attachments.map((att) => (
                <button
                  key={att.id}
                  onClick={() =>
                    att.mimeType.startsWith("image/")
                      ? setImagePreview(att.publicUrl)
                      : window.open(att.publicUrl, "_blank")
                  }
                  className="group relative rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors"
                >
                  {att.mimeType.startsWith("image/") ? (
                    <img
                      src={att.publicUrl}
                      alt={att.fileName}
                      className="w-full h-24 object-cover"
                    />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center bg-muted">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <p className="text-xs text-white">Ver</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate px-1 py-0.5">
                    {att.fileName}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval chain */}
      {r.approvals.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Cadena de aprobación
            </h3>
            <div className="space-y-3">
              {r.approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      approval.decision === "APPROVED"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : approval.decision === "REJECTED"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {approval.approvalOrder}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{approval.approverName}</p>
                    {approval.decision ? (
                      <p className="text-xs text-muted-foreground">
                        {approval.decision === "APPROVED" ? "Aprobó" : "Rechazó"}
                        {approval.decidedAt &&
                          ` el ${format(new Date(approval.decidedAt), "dd MMM yyyy HH:mm", { locale: es })}`}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-400">Pendiente</p>
                    )}
                    {approval.comment && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        &ldquo;{approval.comment}&rdquo;
                      </p>
                    )}
                  </div>
                  {approval.decision === "APPROVED" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  {approval.decision === "REJECTED" && (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History timeline */}
      {r.history.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Historial
            </h3>
            <div className="relative pl-4 border-l border-border space-y-4">
              {r.history.map((event) => (
                <div key={event.id} className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-border bg-background" />
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">
                        {ACTION_LABELS[event.action] ?? event.action}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}por {event.userName}
                      </span>
                    </p>
                    {event.comment && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">
                        &ldquo;{event.comment}&rdquo;
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(event.createdAt), "dd MMM yyyy HH:mm", {
                        locale: es,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pb-8">
        {/* DRAFT → Edit, Delete, Submit */}
        {r.status === "DRAFT" && permissions.canEdit && (
          <>
            <Link href={`/finanzas/rendiciones/${r.id}/editar`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1.5" />
                Editar
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={loading === "delete"}
              className="text-red-400 hover:text-red-300"
            >
              {loading === "delete" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Eliminar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => performAction("submit")}
              disabled={loading === "submit"}
            >
              {loading === "submit" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Enviar a aprobación
            </Button>
          </>
        )}

        {/* SUBMITTED / IN_APPROVAL → Approve, Reject (for approvers) */}
        {(r.status === "SUBMITTED" || r.status === "IN_APPROVAL") &&
          permissions.canApprove && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => performAction("approve")}
                disabled={loading === "approve"}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {loading === "approve" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Aprobar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRejectDialogOpen(true)}
                className="text-red-400 hover:text-red-300"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Rechazar
              </Button>
            </>
          )}

        {/* REJECTED → Edit, Resubmit (for owner) */}
        {r.status === "REJECTED" && permissions.canEdit && (
          <>
            <Link href={`/finanzas/rendiciones/${r.id}/editar`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1.5" />
                Editar
              </Button>
            </Link>
            <Button
              type="button"
              size="sm"
              onClick={() => performAction("resubmit")}
              disabled={loading === "resubmit"}
            >
              {loading === "resubmit" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Reenviar
            </Button>
          </>
        )}

        {/* APPROVED → Mark as Paid (for finance) */}
        {r.status === "APPROVED" && permissions.canPay && (
          <Button
            type="button"
            size="sm"
            onClick={() => performAction("pay")}
            disabled={loading === "pay"}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading === "pay" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4 mr-1.5" />
            )}
            Marcar como pagada
          </Button>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar rendición</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rejectReason">Motivo del rechazo</Label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Describe por qué se rechaza esta rendición..."
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
                disabled={loading === "reject"}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading === "reject" ? (
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

      {/* Image preview dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Adjunto"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Subcomponents ── */

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Receipt;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
