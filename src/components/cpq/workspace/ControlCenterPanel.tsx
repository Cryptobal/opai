"use client";

/**
 * Contenido del Centro de control (resumen comercial + preparación portal +
 * PDF). Extraído de CpqQuoteDetail sin cambio visual; se reutiliza en el aside
 * desktop y en el bottom-sheet móvil del workspace.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CpqPdfPreviewPanel,
  type CpqPdfPreviewMode,
  type CpqPdfTemplateSlug,
} from "@/components/cpq/CpqPdfPreviewPanel";
import { QuoteAttachmentsSection } from "@/components/cpq/QuoteAttachmentsSection";
import { EntityConversations } from "@/components/crm/EntityConversations";

export type PortalReadinessItem = { label: string; ready: boolean };

export function ControlCenterPanel({
  quoteId,
  quoteStatus,
  isLocked,
  crmContext,
  billingMonthlyTotal,
  additionalLinesOneTimeTotal,
  ufValue,
  marginPct,
  totalGuards,
  roleSummary,
  onToggleGuardsBreakdown,
  canSendPortalProposal,
  portalReadinessItems,
  contactHasEmail,
  onSendProposal,
  positionsCount,
  additionalLinesCount,
  pdfPreviewMode,
  pdfTemplateSlug,
  pdfPreviewUrl,
  pdfPreviewLoading,
  onPdfModeChange,
  onPdfTemplateSlugChange,
  onGeneratePdfPreview,
  showConversations = true,
}: {
  quoteId: string;
  quoteStatus: string;
  isLocked: boolean;
  crmContext: { accountId: string; dealId: string; contactId: string; currency: string };
  billingMonthlyTotal: number;
  additionalLinesOneTimeTotal: number;
  ufValue: number | null;
  marginPct: number;
  totalGuards: number;
  roleSummary: Array<{ qty: number; label: string }>;
  onToggleGuardsBreakdown: () => void;
  canSendPortalProposal: boolean;
  portalReadinessItems: PortalReadinessItem[];
  contactHasEmail: boolean;
  onSendProposal: () => void;
  positionsCount: number;
  additionalLinesCount: number;
  pdfPreviewMode: CpqPdfPreviewMode;
  pdfTemplateSlug: CpqPdfTemplateSlug;
  pdfPreviewUrl: string | null;
  pdfPreviewLoading: boolean;
  onPdfModeChange: (mode: CpqPdfPreviewMode) => void;
  onPdfTemplateSlugChange: (slug: CpqPdfTemplateSlug) => void;
  onGeneratePdfPreview: () => void;
  showConversations?: boolean;
}) {
  const sendDisabled =
    (positionsCount === 0 && additionalLinesCount === 0) ||
    !crmContext.accountId ||
    !crmContext.contactId ||
    !crmContext.dealId;

  return (
    <div className="space-y-4 p-4">
      {showConversations && quoteId && (
        <EntityConversations
          entityType="quote"
          entityId={quoteId}
          accountId={crmContext.accountId}
          dealId={crmContext.dealId}
          contactId={crmContext.contactId}
          variant="rail"
        />
      )}
      <div className="rounded-xl border border-status-ok-border bg-gradient-to-br from-emerald-500/[0.14] via-emerald-500/[0.07] to-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-status-ok-fg dark:text-status-ok-fg">
              Total mensual cliente
            </p>
            <div className="mt-1">
              <CpqDualCurrencyAmount
                clp={billingMonthlyTotal}
                currency={crmContext.currency || "CLP"}
                ufValue={ufValue}
                size="lg"
                align="left"
                primaryClassName="text-2xl font-bold"
              />
            </div>
          </div>
          <Badge variant="outline" className="border-status-ok-border bg-background/50 text-[11px] text-status-ok-fg dark:text-status-ok-fg">
            Mensual
          </Badge>
        </div>
      </div>

      {additionalLinesOneTimeTotal > 0 && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-status-warn-fg">
                Pago inicial único
              </p>
              <div className="mt-1">
                <CpqDualCurrencyAmount
                  clp={additionalLinesOneTimeTotal}
                  currency={crmContext.currency || "CLP"}
                  ufValue={ufValue}
                  size="sm"
                  align="left"
                  primaryClassName="text-base font-bold"
                />
              </div>
            </div>
            <Badge variant="outline" className="border-status-warn-border bg-background/50 text-[11px] text-status-warn-fg">
              Una vez
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se cobra una sola vez, fuera del total mensual.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-background/45 p-3">
          <p className="text-xs font-medium text-muted-foreground">Margen</p>
          <p className={cn("mt-1 text-lg font-bold", marginPct >= 15 ? "text-status-ok-fg" : marginPct >= 10 ? "text-status-warn-fg" : "text-status-danger-fg")}>
            {Number(marginPct || 0).toFixed(1)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleGuardsBreakdown}
          disabled={roleSummary.length === 0}
          className="rounded-lg border border-border/60 bg-background/45 p-3 text-left transition-colors enabled:hover:bg-muted/20 disabled:cursor-default"
        >
          <p className="text-xs font-medium text-muted-foreground">Dotación</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-bold">
            <Users className="h-4 w-4 text-status-info-fg" />
            {totalGuards}
          </p>
        </button>
      </div>

      {roleSummary.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Roles principales
          </p>
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/35 p-3">
            {roleSummary.slice(0, 4).map((item, idx) => (
              <div key={`${item.label}-${idx}`} className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-2 py-1.5 text-xs">
                <span className="break-words text-muted-foreground">{item.label}</span>
                <span className="font-mono font-semibold text-foreground">{item.qty}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t border-border/50 pt-3">
        <div className="space-y-2 rounded-lg border border-border/60 bg-background/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preparación portal
            </p>
            <span className={cn("text-xs font-semibold", canSendPortalProposal ? "text-status-ok-fg" : "text-status-warn-fg")}>
              {portalReadinessItems.filter((item) => item.ready).length}/{portalReadinessItems.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {portalReadinessItems.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    item.ready
                      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                      : "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                  )}
                  aria-hidden
                >
                  {item.ready ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn("truncate", item.ready ? "text-foreground" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Button
          className="h-9 w-full gap-2 bg-status-ok text-white hover:brightness-110"
          disabled={sendDisabled}
          title={
            crmContext.contactId && !contactHasEmail
              ? "El contacto no tiene email cargado"
              : undefined
          }
          onClick={onSendProposal}
        >
          <Send className="h-4 w-4" />
          {quoteStatus === "sent" ? "Reenviar propuesta" : "Enviar propuesta"}
        </Button>
        <CpqPdfPreviewPanel
          mode={pdfPreviewMode}
          templateSlug={pdfTemplateSlug}
          previewUrl={pdfPreviewUrl}
          loading={pdfPreviewLoading}
          onModeChange={onPdfModeChange}
          onTemplateSlugChange={onPdfTemplateSlugChange}
          onGenerate={onGeneratePdfPreview}
          footer={
            <QuoteAttachmentsSection
              quoteId={quoteId}
              isLocked={isLocked}
              defaultExpanded
              compact
              className="mt-0 border-border/60 bg-background/40 shadow-none"
            />
          }
        />
      </div>
    </div>
  );
}
