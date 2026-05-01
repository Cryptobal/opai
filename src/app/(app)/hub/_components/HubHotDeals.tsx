// DEPRECATED: replaced by HubHotDealsTable.tsx + HubHotDealsMobile.tsx
'use client';

import { Flame } from 'lucide-react';
import { HubHotDealRow, HubHotDealTableRow } from './HubHotDealRow';
import type { ClosingHotDeal } from '../_lib/hub-types';

interface Props {
  deals: ClosingHotDeal[];
}

export function HubHotDeals({ deals }: Props) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Flame className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No hay propuestas activas con engagement.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Envía tu primera cotización desde el pipeline.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Flame className="h-4 w-4 text-status-warn-fg" />
        <p className="text-xs font-semibold">Propuestas calientes</p>
        <span className="text-[10px] text-muted-foreground">({deals.length})</span>
      </div>

      {/* Mobile: cards */}
      <div className="lg:hidden space-y-2">
        {deals.map((deal, idx) => (
          <HubHotDealRow key={deal.id} deal={deal} rank={idx + 1} />
        ))}
      </div>

      {/* Desktop: dense table */}
      <div className="hidden lg:block rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-left table-fixed">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5 w-10">#</th>
              <th className="px-2 py-1.5 w-[22%]">Empresa / Negocio</th>
              <th className="px-2 py-1.5 w-[24%]">Contacto</th>
              <th className="px-2 py-1.5 w-[14%]">Etapa</th>
              <th className="px-2 py-1.5 text-center w-[14%]">Vistas</th>
              <th className="px-2 py-1.5 text-center w-[10%]">Score</th>
              <th className="px-2 py-1.5 text-right w-[14%]">Monto</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal, idx) => (
              <HubHotDealTableRow key={deal.id} deal={deal} rank={idx + 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
