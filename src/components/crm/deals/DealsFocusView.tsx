"use client";

import type { ReactNode } from "react";
import { Surface, SectionHeader, Tag } from "@/components/opai-ds";
import { formatCLP } from "@/lib/utils";
import { daysInStage } from "@/lib/crm/deal-metrics";
import type { CrmDeal } from "@/types";
import { getDealCommercialIndicators } from "./deals-helpers";

type Props = {
  deals: CrmDeal[];
  onOpen: (deal: CrmDeal) => void;
};

export function DealsFocusView({ deals, onOpen }: Props) {
  const stalled = [...deals]
    .filter((d) => daysInStage(d).days > 30)
    .sort((a, b) => daysInStage(b).days - daysInStage(a).days)
    .slice(0, 8);

  const noQuote = deals
    .filter((d) => getDealCommercialIndicators(d).amountClp === 0)
    .slice(0, 8);

  const topAmount = [...deals]
    .sort(
      (a, b) =>
        getDealCommercialIndicators(b).amountClp -
        getDealCommercialIndicators(a).amountClp,
    )
    .filter((d) => getDealCommercialIndicators(d).amountClp > 0)
    .slice(0, 6);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <FocusCard
        title="Sin movimiento"
        subtitle="Más de 30 días en etapa"
        deals={stalled}
        onOpen={onOpen}
        meta={(d) => `${daysInStage(d).days} d`}
      />
      <FocusCard
        title="Sin cotización activa"
        subtitle="Monto en $0"
        deals={noQuote}
        onOpen={onOpen}
        meta={() => (
          <Tag variant="warn" size="sm">Sin cotiz.</Tag>
        )}
      />
      <FocusCard
        title="Mayor monto abierto"
        subtitle="Top 6 del pipeline"
        deals={topAmount}
        onOpen={onOpen}
        meta={(d) => formatCLP(getDealCommercialIndicators(d).amountClp)}
      />
    </div>
  );
}

function FocusCard({
  title,
  subtitle,
  deals,
  onOpen,
  meta,
}: {
  title: string;
  subtitle: string;
  deals: CrmDeal[];
  onOpen: (d: CrmDeal) => void;
  meta: (d: CrmDeal) => ReactNode;
}) {
  return (
    <Surface elevation={1} padding="md" className="min-w-0">
      <SectionHeader title={title} hint={subtitle} />
      <ul className="ds-list-cascade mt-3 space-y-1">
        {deals.length === 0 ? (
          <li className="py-4 text-center text-[13px] text-ds-text-3">Sin casos</li>
        ) : (
          deals.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onOpen(d)}
                className="deals-touch flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-ds-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ds-text-1">{d.title}</p>
                  <p className="truncate text-[12px] text-ds-text-3">{d.account?.name}</p>
                </div>
                <span className="shrink-0 text-[12px] tabular-nums text-ds-text-2">
                  {meta(d)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Surface>
  );
}
