import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCLP, formatUFSuffix } from '@/lib/utils';
import type { CrmMetrics } from '../_lib/hub-types';

type CommercialKpiCard = {
  label: string;
  value: string;
  href: string;
};

export function HubCommercialKpiBlock({
  crmMetrics,
}: {
  crmMetrics: CrmMetrics;
}) {
  const cards: CommercialKpiCard[] = [
    {
      label: 'Leads abiertos',
      value: crmMetrics.leadsOpenCount.toLocaleString('es-CL'),
      href: '/crm/leads?status=pending',
    },
    {
      label: 'Leads en borrador',
      value: crmMetrics.leadsDraftCount.toLocaleString('es-CL'),
      href: '/crm/leads?status=in_review',
    },
    {
      label: 'Cotizaciones en borrador',
      value: crmMetrics.quotesDraftCount.toLocaleString('es-CL'),
      href: '/crm/cotizaciones?status=draft',
    },
    {
      label: 'Negocios negociando',
      value: crmMetrics.dealsNegotiatingCount.toLocaleString('es-CL'),
      href: '/crm/deals?focus=followup-open',
    },
    {
      label: 'Guardias en negociación',
      value: crmMetrics.guardsInNegotiation.toLocaleString('es-CL'),
      href: '/crm/deals?focus=followup-open',
    },
    {
      label: 'Monto en negociación (CLP)',
      value: formatCLP(Math.round(crmMetrics.amountInNegotiationClp)),
      href: '/crm/deals?focus=followup-open',
    },
    {
      label: 'Monto en negociación (UF)',
      value: formatUFSuffix(crmMetrics.amountInNegotiationUf),
      href: '/crm/deals?focus=followup-open',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dashboard comercial</CardTitle>
        <CardDescription>
          Resumen rápido de pipeline, cotizaciones y negociación activa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
            >
              <p className="text-xl font-semibold leading-tight tracking-tight">
                {card.value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {card.label}
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
