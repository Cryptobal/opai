"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Download,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface PortalContract {
  id: string;
  uniqueId: string;
  title: string;
  category: string;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  pdfUrl: string | null;
  signatureStatus: string | null;
  signatureCompletedAt: string | null;
  createdAt: string;
}

interface Props {
  tenantId: string;
  accountId: string;
}

/* ── Helpers ── */

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active: { label: "Vigente", color: "text-status-ok-fg bg-status-ok-soft border-status-ok-border", icon: CheckCircle2 },
  draft: { label: "Borrador", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20", icon: Clock },
  expiring: { label: "Por vencer", color: "text-status-warn-fg bg-status-warn-soft border-status-warn-border", icon: AlertTriangle },
  expired: { label: "Vencido", color: "text-status-danger-fg bg-status-danger-soft border-status-danger-border", icon: AlertTriangle },
};

const CATEGORY_LABELS: Record<string, string> = {
  contrato_cliente: "Contrato de Servicios",
  contrato_servicio: "Contrato de Servicio",
  contrato_confidencialidad: "Confidencialidad",
  acuerdo_nivel_servicio: "SLA",
  adendum: "Adendum",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Component ── */

export function PortalContractsSection({ tenantId, accountId }: Props) {
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tenantId, accountId });
      const res = await fetch(`/api/portal/cliente/contracts?${params}`);
      const json = await res.json();
      if (json.success) setContracts(json.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [tenantId, accountId]);

  useEffect(() => {
    void fetchContracts();
  }, [fetchContracts]);

  if (loading && contracts.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-status-info-fg" />
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-400">No hay contratos disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contracts.map((c) => {
        const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.active;
        const StatusIcon = statusCfg.icon;
        const categoryLabel = CATEGORY_LABELS[c.category] ?? c.category;
        const isSigned = c.signatureStatus === "completed";

        return (
          <div
            key={c.id}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1">
                  <FileText className="h-4 w-4 text-status-info-fg shrink-0 mt-0.5" />
                  <h3 className="text-sm font-medium break-words">{c.title}</h3>
                </div>
                <p className="text-[10px] text-zinc-500 mb-2">{categoryLabel}</p>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Status badge */}
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", statusCfg.color)}>
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </span>

                  {/* Signature badge */}
                  {isSigned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-status-ok-fg bg-status-ok-soft border-status-ok-border">
                      <CheckCircle2 className="h-3 w-3" />
                      Firmado
                    </span>
                  )}
                  {c.signatureStatus === "pending" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-status-warn-fg bg-status-warn-soft border-status-warn-border">
                      <Clock className="h-3 w-3" />
                      Pendiente firma
                    </span>
                  )}
                </div>

                {/* Dates */}
                <div className="flex gap-4 mt-2 text-[10px] text-zinc-500">
                  {c.effectiveDate && (
                    <span>Inicio: {formatDate(c.effectiveDate)}</span>
                  )}
                  {c.expirationDate && (
                    <span>Vencimiento: {formatDate(c.expirationDate)}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {c.pdfUrl && (
                  <a
                    href={c.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                    title="Descargar PDF"
                  >
                    <Download className="h-4 w-4 text-zinc-400" />
                  </a>
                )}
                <a
                  href={`/portal/cliente/documentos/${c.uniqueId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  title="Ver documento"
                >
                  <ExternalLink className="h-4 w-4 text-zinc-400" />
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
