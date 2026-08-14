"use client";

/**
 * Contenido del Centro de control (resumen comercial + preparación portal +
 * PDF). Extraído de CpqQuoteDetail sin cambio visual; se reutiliza en el aside
 * desktop y en el bottom-sheet móvil del workspace.
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tag } from "@/components/opai-ds";
import { CpqDualCurrencyAmount } from "@/components/cpq/CpqDualCurrency";
import {
  CpqPdfPreviewPanel,
  type CpqPdfPreviewMode,
  type CpqPdfTemplateSlug,
} from "@/components/cpq/CpqPdfPreviewPanel";
import { QuoteAttachmentsSection } from "@/components/cpq/QuoteAttachmentsSection";
import { EntityConversations } from "@/components/crm/EntityConversations";

export function ControlCenterPanel({
  quoteId,
  isLocked,
  crmContext,
  billingMonthlyTotal,
  additionalLinesOneTimeTotal,
  ufValue,
  marginPct,
  totalGuards,
  roleSummary,
  onToggleGuardsBreakdown,
  isLicitacion = false,
  dealTitle = null,
  dealStageName = null,
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
  isLocked: boolean;
  crmContext: { accountId: string; dealId: string; contactId: string; currency: string };
  billingMonthlyTotal: number;
  additionalLinesOneTimeTotal: number;
  ufValue: number | null;
  marginPct: number;
  totalGuards: number;
  roleSummary: Array<{ qty: number; label: string }>;
  onToggleGuardsBreakdown: () => void;
  isLicitacion?: boolean;
  dealTitle?: string | null;
  dealStageName?: string | null;
  pdfPreviewMode: CpqPdfPreviewMode;
  pdfTemplateSlug: CpqPdfTemplateSlug;
  pdfPreviewUrl: string | null;
  pdfPreviewLoading: boolean;
  onPdfModeChange: (mode: CpqPdfPreviewMode) => void;
  onPdfTemplateSlugChange: (slug: CpqPdfTemplateSlug) => void;
  onGeneratePdfPreview: () => void | Promise<void | string | null>;
  showConversations?: boolean;
}) {
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

      <div className="rounded-lg border border-border/60 bg-background/45 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Negocio asociado
        </p>
        {crmContext.dealId && dealTitle ? (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-ds-text-3" aria-hidden />
            <Link
              href={`/crm/deals/${crmContext.dealId}`}
              className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
              title="Abrir negocio en CRM"
            >
              {dealTitle}
            </Link>
            {dealStageName ? (
              <Tag variant="info" size="sm">{dealStageName}</Tag>
            ) : null}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-status-warn-fg">
            Sin negocio — asígnalo en Datos
          </p>
        )}
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Propuesta
            </p>
            {isLicitacion ? <Tag variant="info" size="sm">Licitación</Tag> : <Tag variant="neutral" size="sm">Comercial</Tag>}
          </div>
          <a
            href="#sec-propuesta"
            className="text-[13px] font-medium text-primary hover:underline"
          >
            Ver propuesta →
          </a>
        </div>
        <CpqPdfPreviewPanel
          mode={pdfPreviewMode}
          templateSlug={pdfTemplateSlug}
          previewUrl={pdfPreviewUrl}
          loading={pdfPreviewLoading}
          allowedModes={["cotizacion"]}
          title="Cotización PDF"
          description="Documento económico. La propuesta se genera desde la card Propuesta."
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
