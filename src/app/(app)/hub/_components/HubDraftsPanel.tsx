import Link from "next/link";
import {
  ArrowRight,
  FilePenLine,
  UserRoundSearch,
} from "lucide-react";
import {
  IconBubble,
  SectionHeader,
  Surface,
  Tag,
} from "@/components/opai-ds";
import { timeAgo } from "@/lib/utils";
import type {
  ClosingDraftLead,
  ClosingDraftQuote,
} from "../_lib/hub-types";

function formatQuoteAmount(quote: ClosingDraftQuote): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(quote.monthlyCost);
}

function EmptyDraftList({ children }: { children: string }) {
  return (
    <p className="rounded-ds-md bg-ds-surface-2 px-3 py-4 text-center text-ds-body text-ds-text-3">
      {children}
    </p>
  );
}

export function HubDraftsPanel({
  quoteCount,
  leadCount,
  quotes,
  leads,
}: {
  quoteCount: number;
  leadCount: number;
  quotes: ClosingDraftQuote[];
  leads: ClosingDraftLead[];
}) {
  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <SectionHeader
        title="Borradores"
        hint="Continúa cotizaciones y leads exactamente donde quedaron."
        actions={
          <Tag variant={quoteCount + leadCount > 0 ? "warn" : "neutral"} dot>
            {quoteCount + leadCount} pendientes
          </Tag>
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 space-y-3" aria-labelledby="draft-quotes">
          <div className="flex items-center gap-3">
            <IconBubble icon={FilePenLine} tone="violet" size="sm" />
            <div className="min-w-0 flex-1">
              <h3
                id="draft-quotes"
                className="text-ds-body font-semibold text-ds-text-1"
              >
                Cotizaciones
              </h3>
              <p className="text-[12px] text-ds-text-3">
                {quoteCount} sin enviar
              </p>
            </div>
            <Link
              href="/crm/cotizaciones"
              className="inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold text-primary"
            >
              Ver todas
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {quotes.length === 0 ? (
            <EmptyDraftList>No hay cotizaciones en borrador.</EmptyDraftList>
          ) : (
            <ul className="ds-list-cascade divide-y divide-ds-border-subtle rounded-ds-md border border-ds-border-subtle">
              {quotes.slice(0, 4).map((quote) => (
                <li key={quote.id}>
                  <Link
                    href={`/crm/cotizaciones/${quote.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-ds-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ds-body font-medium text-ds-text-1">
                        {quote.clientName || quote.name || quote.code}
                      </p>
                      <p className="truncate text-[12px] text-ds-text-4">
                        {quote.code} · editada {timeAgo(quote.updatedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[12px] font-medium text-tint-violet-fg">
                      {formatQuoteAmount(quote)}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ds-text-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 space-y-3" aria-labelledby="draft-leads">
          <div className="flex items-center gap-3">
            <IconBubble icon={UserRoundSearch} variant="warn" size="sm" />
            <div className="min-w-0 flex-1">
              <h3
                id="draft-leads"
                className="text-ds-body font-semibold text-ds-text-1"
              >
                Leads
              </h3>
              <p className="text-[12px] text-ds-text-3">
                {leadCount} por calificar
              </p>
            </div>
            <Link
              href="/crm/leads?status=in_review"
              className="inline-flex min-h-11 items-center gap-1 text-[12px] font-semibold text-primary"
            >
              Ver todos
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {leads.length === 0 ? (
            <EmptyDraftList>No hay leads en borrador.</EmptyDraftList>
          ) : (
            <ul className="ds-list-cascade divide-y divide-ds-border-subtle rounded-ds-md border border-ds-border-subtle">
              {leads.slice(0, 4).map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/crm/leads/${lead.id}`}
                    className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-ds-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ds-body font-medium text-ds-text-1">
                        {lead.companyName || lead.contactName}
                      </p>
                      <p className="truncate text-[12px] text-ds-text-4">
                        {lead.contactName}
                        {lead.source ? ` · ${lead.source}` : ""}
                        {` · editado ${timeAgo(lead.updatedAt)}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[12px] font-semibold text-status-warn-fg">
                      Calificar
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-ds-text-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Surface>
  );
}
