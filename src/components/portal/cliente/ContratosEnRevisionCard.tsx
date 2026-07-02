"use client";

import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";

/**
 * Banner del dashboard del portal cliente: destaca los contratos que están en
 * revisión para que el cliente entre directo al visor `/contrato/{token}` y
 * los revise/sugiera/acepte. Espeja el patrón de DashboardCotizacionesPendientes
 * (fetch → filtrar → autoocultar si no hay). Se autooculta cuando no hay
 * contratos en revisión.
 */

interface PortalContractLite {
  id: string;
  title: string;
  status: string;
  contractClientToken: string | null;
}

const IN_REVIEW_STATUSES = new Set(["in_review", "review"]);

export function ContratosEnRevisionCard() {
  const [contracts, setContracts] = useState<PortalContractLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/cliente/contracts")
      .then((r) => r.json())
      .then((json) => {
        if (json?.success) {
          const inReview = (json.data as PortalContractLite[]).filter(
            (c) => IN_REVIEW_STATUSES.has(c.status) && c.contractClientToken,
          );
          setContracts(inReview);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-24 rounded-xl bg-zinc-800/50" />;
  if (contracts.length === 0) return null;

  return (
    <div className="rounded-xl border border-status-warn-border bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-warn opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-status-warn" />
        </span>
        <span className="text-sm font-medium text-white">
          Tienes {contracts.length} contrato{contracts.length !== 1 ? "s" : ""} en revisión
        </span>
      </div>

      <div className="space-y-2">
        {contracts.slice(0, 3).map((c) => (
          <a
            key={c.id}
            href={`/contrato/${c.contractClientToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileSignature className="w-4 h-4 text-status-warn-fg shrink-0" />
              <span className="text-xs text-zinc-300 truncate">{c.title}</span>
            </div>
            <span className="text-xs font-medium text-status-warn-fg shrink-0 ml-2">
              Revisar &rarr;
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
