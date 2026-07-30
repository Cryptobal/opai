"use client";

/**
 * @deprecated Centro de control de propuesta v1. En el workspace unificado las
 * acciones viven en `BundleStickyBar` (desktop) y en el bottom-sheet
 * `@/components/cpq/workspace/ControlCenterSheet` (móvil).
 */

import { useState } from "react";
import { FileDown, Send, CheckCircle2, Circle } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { EntityConversations } from "@/components/crm/EntityConversations";
import { cn } from "@/lib/utils";
import type { BundleDetail } from "./useBundle";

function fmtMoney(n: number, currency: string) {
  if (currency === "UF") {
    return `${n.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`;
  }
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function BundleControlCenter({
  bundle,
  collapsed,
  onToggle,
  onSend,
}: {
  bundle: BundleDetail;
  collapsed: boolean;
  onToggle: () => void;
  onSend: () => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const t = bundle.totals;
  const hasIncluded = t.includedCount > 0;
  const hasContact = Boolean(bundle.contact?.email);
  const hasPositions = bundle.quotes.some(
    (m) => m.includedInProposal && m.quote.totalPositions > 0,
  );

  const checklist = [
    { ok: hasIncluded, label: "Al menos 1 instalación incluida" },
    { ok: hasPositions, label: "Dotación definida en incluidas" },
    { ok: hasContact, label: "Contacto con email" },
    { ok: bundle.conditionsSynced, label: "Condiciones sincronizadas" },
  ];

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/proposal-pdf`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error al generar PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bundle.code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Error PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col gap-3 shrink-0 transition-[width]",
        collapsed ? "w-12" : "w-[300px]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="text-[12px] text-ds-text-3 self-end hover:text-foreground h-10 px-2"
      >
        {collapsed ? "▸" : "Centro ▾"}
      </button>
      {!collapsed ? (
        <div className="sticky top-4 space-y-3 max-h-[calc(100vh-6rem)] overflow-y-auto pb-4">
          <Surface elevation={1} padding="md" className="space-y-2">
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">
              Totales
            </p>
            <p className="font-mono text-lg text-primary">
              {fmtMoney(t.totalMonthly, t.currency)}
            </p>
            <p className="text-[13px] text-ds-text-2">
              Margen{" "}
              {t.weightedMarginPct != null
                ? `${t.weightedMarginPct.toFixed(1)}%`
                : "—"}{" "}
              · {t.totalGuards} guardias
            </p>
            <ul className="text-[12px] text-ds-text-3 space-y-1">
              {bundle.quotes
                .filter((m) => m.includedInProposal)
                .map((m) => (
                  <li key={m.id}>
                    {m.quote.installation?.name || m.quote.code}
                  </li>
                ))}
            </ul>
          </Surface>

          <Surface elevation={1} padding="md" className="space-y-2">
            <p className="text-[12px] uppercase tracking-wide text-ds-text-3">
              Preparación
            </p>
            {checklist.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-[13px]">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-status-ok-fg" />
                ) : (
                  <Circle className="h-4 w-4 text-ds-text-4" />
                )}
                <span className={c.ok ? "text-foreground" : "text-ds-text-3"}>
                  {c.label}
                </span>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="h-10 bg-status-ok hover:bg-status-ok/90"
                disabled={!hasIncluded || !hasContact}
                onClick={onSend}
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar propuesta
              </Button>
              <Button
                variant="outline"
                className="h-10"
                disabled={!hasIncluded || pdfLoading}
                onClick={() => void downloadPdf()}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {pdfLoading ? "Generando…" : "Generar PDF"}
              </Button>
            </div>
          </Surface>

          {bundle.dealId ? (
            <Surface elevation={1} padding="sm">
              <p className="text-[12px] uppercase tracking-wide text-ds-text-3 px-1 mb-2">
                Conversaciones
              </p>
              <EntityConversations
                entityType="deal"
                entityId={bundle.dealId}
                variant="rail"
                accountId={bundle.accountId}
                dealId={bundle.dealId}
                contactId={bundle.contactId}
              />
            </Surface>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
