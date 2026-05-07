"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Coins,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHero,
  Surface,
  SectionHeader,
  Tag,
  type TagVariant,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FinanceFactoringStatus } from "@prisma/client";
import { FactoringTimeline } from "./FactoringTimeline";

interface OperationDetail {
  id: string;
  code: string;
  status: FinanceFactoringStatus;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  fundedAt: string | null;
  collectedAt: string | null;
  closedAt: string | null;
  fechaCesion: string | null;
  fechaVencimiento: string | null;
  plazoDias: number | null;
  invoiceAmount: number;
  montoCesion: number | null;
  advanceRate: number;
  advanceAmount: number;
  interestRate: number;
  interestAmount: number;
  commissionAmount: number;
  netAdvance: number;
  retentionAmount: number;
  cesionarioRut: string | null;
  cesionarioRazonSoc: string | null;
  cesionarioEmail: string | null;
  cesionarioDireccion: string | null;
  factoringCompany: string;
  factoringCompanyId: string | null;
  cessionMethod: string;
  aecTrackId: string | null;
  cessionSiiStatus: string | null;
  cessionLastCheckedAt: string | null;
  cessionStatusError: string | null;
  hasAecXml: boolean;
  emailDeudor: string | null;
  otrasCondiciones: string | null;
  dte: {
    id: string;
    dteType: number;
    folio: number;
    receiverRut: string;
    receiverName: string;
    siiStatus: string | null;
    totalAmount: number;
    date: string;
  };
}

interface Props {
  operation: OperationDetail;
  canIssue: boolean;
}

const STATUS_VARIANT: Record<FinanceFactoringStatus, TagVariant> = {
  SIMULATED: "neutral",
  SUBMITTED: "info",
  APPROVED: "ok",
  FUNDED: "ok",
  COLLECTED: "ok",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<FinanceFactoringStatus, string> = {
  SIMULATED: "Simulada",
  SUBMITTED: "Enviada al SII",
  APPROVED: "Aprobada",
  FUNDED: "Girada",
  COLLECTED: "Cobrada",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

function formatCLP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

function minutesAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

export function FactoringOperationDetail({ operation: op, canIssue }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function callTransition(action: "mark-funded" | "mark-collected" | "mark-closed") {
    setSubmitting(action);
    try {
      const res = await fetch(
        `/api/finance/factoring/operations/${op.id}/${action}`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error en la transición");
        return;
      }
      toast.success("Estado actualizado");
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCancel() {
    if (cancelReason.trim().length < 3) {
      toast.error("La razón debe tener al menos 3 caracteres");
      return;
    }
    setSubmitting("cancel");
    try {
      const res = await fetch(`/api/finance/factoring/operations/${op.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error cancelando");
        return;
      }
      toast.success("Operación cancelada");
      setShowCancelDialog(false);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const isElectronic = op.cessionMethod === "ELECTRONIC";
  const showSiiBanner = isElectronic && op.status === "SUBMITTED";
  const recentlyChecked =
    op.cessionLastCheckedAt && minutesAgo(op.cessionLastCheckedAt) < 60;
  const minutesUntilNext = op.cessionLastCheckedAt
    ? Math.max(0, 60 - minutesAgo(op.cessionLastCheckedAt))
    : 60;

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Coins />}
        iconTone="teal"
        title={op.code}
        subtitle={`Cesión a ${op.factoringCompany}`}
        description={
          <span className="inline-flex items-center gap-2">
            <Tag variant={STATUS_VARIANT[op.status]} size="sm">
              {STATUS_LABEL[op.status]}
            </Tag>
            {op.fechaCesion ? (
              <span className="text-xs text-ds-text-3">
                Cedida el {op.fechaCesion}
              </span>
            ) : null}
          </span>
        }
      />

      {showSiiBanner ? (
        <Surface
          elevation={1}
          padding="md"
          className={
            op.cessionStatusError
              ? "border border-status-danger-border bg-status-danger-soft"
              : "border border-status-info-border bg-status-info-soft"
          }
        >
          {op.cessionStatusError ? (
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-status-danger-fg shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-status-danger-fg">
                  El SII reportó un problema con esta cesión
                </div>
                <div className="text-xs text-ds-text-2 mt-1">
                  {op.cessionStatusError}
                </div>
              </div>
            </div>
          ) : recentlyChecked && op.cessionSiiStatus ? (
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-status-info-fg shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-status-info-fg">
                  Estado SII: {op.cessionSiiStatus}
                </div>
                <div className="text-xs text-ds-text-2 mt-1">
                  Última consulta hace {minutesAgo(op.cessionLastCheckedAt!)} min.
                  El cron consulta el SII cada hora.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-status-info-fg shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-status-info-fg">
                  Verificando estado en SII…
                </div>
                <div className="text-xs text-ds-text-2 mt-1">
                  Próxima consulta automática en {minutesUntilNext} min.
                </div>
              </div>
            </div>
          )}
        </Surface>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface elevation={1} padding="md">
          <SectionHeader title="DTE cedido" />
          <div className="space-y-2 text-sm pt-3">
            <Row label="Tipo / Folio" value={`${op.dte.dteType}-${op.dte.folio}`} mono />
            <Row label="Fecha emisión" value={op.dte.date} mono />
            <Row label="Receptor" value={op.dte.receiverName} />
            <Row label="RUT" value={op.dte.receiverRut} mono />
            <Row label="Monto bruto" value={formatCLP(op.dte.totalAmount)} mono right />
            <div className="pt-2">
              <Link
                href={`/finanzas/facturacion?folio=${op.dte.folio}`}
                className="text-xs text-primary hover:underline"
              >
                Ver factura original →
              </Link>
            </div>
          </div>
        </Surface>

        <Surface elevation={1} padding="md">
          <SectionHeader title="Cesionario" />
          <div className="space-y-2 text-sm pt-3">
            <Row label="Razón social" value={op.cesionarioRazonSoc ?? op.factoringCompany} />
            <Row label="RUT" value={op.cesionarioRut ?? "—"} mono />
            <Row label="Email" value={op.cesionarioEmail ?? "—"} />
            <Row label="Dirección" value={op.cesionarioDireccion ?? "—"} />
            <Row label="Email deudor" value={op.emailDeudor ?? "—"} />
          </div>
        </Surface>

        <Surface elevation={1} padding="md">
          <SectionHeader title="Términos económicos" />
          <div className="space-y-2 text-sm pt-3">
            <Row label="Monto bruto" value={formatCLP(op.invoiceAmount)} mono right />
            <Row
              label={`Anticipo (${op.advanceRate}%)`}
              value={formatCLP(op.advanceAmount)}
              mono
              right
            />
            <Row
              label={`Interés (${op.interestRate}%/m × ${op.plazoDias ?? 0}d)`}
              value={`-${formatCLP(op.interestAmount)}`}
              mono
              right
            />
            <Row label="Comisión" value={`-${formatCLP(op.commissionAmount)}`} mono right />
            <div className="border-t border-ds-border-subtle pt-2">
              <Row
                label="Neto a girar"
                value={formatCLP(op.netAdvance)}
                mono
                right
                strong
              />
            </div>
            <Row label="Retención" value={formatCLP(op.retentionAmount)} mono right />
          </div>
        </Surface>
      </div>

      <Surface elevation={1} padding="md">
        <SectionHeader title="Lifecycle" />
        <FactoringTimeline
          status={op.status}
          submittedAt={op.submittedAt}
          approvedAt={op.approvedAt}
          fundedAt={op.fundedAt}
          collectedAt={op.collectedAt}
          closedAt={op.closedAt}
        />
      </Surface>

      {op.aecTrackId ? (
        <Surface elevation={1} padding="md">
          <SectionHeader title="Trazabilidad SII" />
          <div className="space-y-2 text-sm">
            <Row label="TrackId RPETC" value={op.aecTrackId} mono />
            <Row label="Estado SII" value={op.cessionSiiStatus ?? "—"} mono />
            <Row
              label="Última consulta"
              value={
                op.cessionLastCheckedAt
                  ? new Date(op.cessionLastCheckedAt).toLocaleString("es-CL")
                  : "—"
              }
            />
          </div>
        </Surface>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-end">
        {op.hasAecXml ? (
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/finance/factoring/operations/${op.id}/aec`}
              download
            >
              <Download className="h-4 w-4 mr-1.5" /> Descargar AEC
            </a>
          </Button>
        ) : null}
        {canIssue && op.status === "APPROVED" ? (
          <Button
            size="sm"
            onClick={() => callTransition("mark-funded")}
            disabled={submitting !== null}
          >
            {submitting === "mark-funded" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Marcar girada
          </Button>
        ) : null}
        {canIssue && op.status === "FUNDED" ? (
          <Button
            size="sm"
            onClick={() => callTransition("mark-collected")}
            disabled={submitting !== null}
          >
            {submitting === "mark-collected" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Marcar cobrada
          </Button>
        ) : null}
        {canIssue && op.status === "COLLECTED" ? (
          <Button
            size="sm"
            onClick={() => callTransition("mark-closed")}
            disabled={submitting !== null}
          >
            {submitting === "mark-closed" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : null}
            Marcar cerrada
          </Button>
        ) : null}
        {canIssue &&
        ["SIMULATED", "SUBMITTED", "APPROVED"].includes(op.status) ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCancelDialog(true)}
            disabled={submitting !== null}
          >
            Cancelar operación
          </Button>
        ) : null}
      </div>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar operación de cesión</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancelReason">Razón de la cancelación</Label>
            <Textarea
              id="cancelReason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej: factoring rechazó por riesgo del deudor"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={submitting === "cancel"}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={submitting === "cancel"}
            >
              {submitting === "cancel" ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Confirmar cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  right,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  right?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-ds-text-3">{label}</span>
      <span
        className={`${mono ? "font-mono " : ""}${right ? "text-right " : ""}${strong ? "font-semibold text-ds-text-1" : "text-ds-text-2"}`}
      >
        {value}
      </span>
    </div>
  );
}
