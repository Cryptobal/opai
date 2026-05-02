'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame } from 'lucide-react';
import { ChipTabs } from '@/components/ui/chip-tabs';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubClosingKpis } from './HubClosingKpis';
import { HubHotDealsTable } from './HubHotDealsTable';
import { HubHotDealsMobile } from './HubHotDealsMobile';
import { HubStaleDeals } from './HubStaleDeals';
import { HubPendingLeads } from './HubPendingLeads';
import { HubPortalRanking } from './HubPortalRanking';
import { HubUpcomingProjects } from './HubUpcomingProjects';
import { formatCLP } from '../_lib/hub-utils';
import type { HubClosingSectionProps } from '../_lib/hub-types';

const LEADS_NUEVOS_STORAGE_KEY = 'hub-leads-nuevos-last-seen';

function getStoredLastSeen(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return parseInt(localStorage.getItem(LEADS_NUEVOS_STORAGE_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

export function HubCrmSection({ closingData, sellerFirstName, upcomingProjects = [] }: HubClosingSectionProps) {
  const [activeTab, setActiveTab] = useState('hot');
  const [leadsLastSeenCount, setLeadsLastSeenCount] = useState(0);
  const { kpis, hotDeals, staleDeals, closedDeals, pendingLeads, portalTopUsers } = closingData;

  useEffect(() => {
    setLeadsLastSeenCount(getStoredLastSeen());
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    if (tabId === 'leads') {
      const count = pendingLeads.length;
      setLeadsLastSeenCount(count);
      try {
        localStorage.setItem(LEADS_NUEVOS_STORAGE_KEY, String(count));
      } catch {
        /* ignore */
      }
    }
  }, [pendingLeads.length]);

  const negotiationFormatted = formatCLP(Math.round(kpis.amountNegotiatingClp));
  const leadsUnseenCount = Math.max(0, pendingLeads.length - leadsLastSeenCount);

  const tabs = [
    { id: 'hot', label: '🔥 Calientes', badge: hotDeals.length },
    ...(closedDeals.length > 0
      ? [{ id: 'closed', label: '✅ Cierres 30d', badge: closedDeals.length }]
      : []),
    ...(upcomingProjects.length > 0
      ? [{ id: 'upcoming', label: '📅 Por iniciar', badge: upcomingProjects.length }]
      : []),
    {
      id: 'leads',
      label: 'Leads nuevos',
      badge: leadsUnseenCount,
      badgeVariant: 'alert' as const,
    },
    { id: 'stale', label: '⚠️ Sin actividad', badge: staleDeals.length },
    ...(portalTopUsers.length > 0
      ? [{ id: 'portal', label: 'Portal' }]
      : []),
  ];

  return (
    <HubCollapsibleSection
      icon={<span className="h-2.5 w-2.5 rounded-full bg-status-info inline-block" />}
      title="Hub de Cierre"
      badge={
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-status-info-fg">
            {negotiationFormatted} negociando
          </span>
        </div>
      }
      defaultOpen
    >
      {/* KPIs — always visible */}
      <HubClosingKpis
        kpis={kpis}
        leadsTrend7d={closingData.leadsTrend7d}
        dealsTrend7d={closingData.dealsTrend7d}
      />

      {/* Tabs — unified for mobile and desktop */}
      <div className="space-y-3 mt-2">
        <ChipTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          compact
        />

        {activeTab === 'hot' && (
          <>
            {hotDeals.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-center">
                <Flame className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-base text-muted-foreground">No hay propuestas activas con engagement.</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Envía tu primera cotización desde el pipeline.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="h-3.5 w-3.5 text-status-warn-fg" />
                  <p className="text-sm font-bold">Propuestas calientes</p>
                  <span className="text-xs text-status-info-fg font-bold tabular-nums bg-status-info-soft rounded px-1.5 py-0.5">
                    {hotDeals.length}
                  </span>
                </div>
                {/* Mobile: cards. Desktop: table. */}
                <div className="md:hidden">
                  <HubHotDealsMobile
                    deals={hotDeals}
                    sellerFirstName={sellerFirstName}
                    tenantName={closingData.commercialName}
                  />
                </div>
                <div className="hidden md:block">
                  <HubHotDealsTable
                    deals={hotDeals}
                    sellerFirstName={sellerFirstName}
                    tenantName={closingData.commercialName}
                  />
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'closed' && (
          <div className="rounded-lg border border-status-ok-border bg-status-ok-soft overflow-hidden">
            <div className="bg-status-ok-soft px-3 py-2 text-xs font-bold text-status-ok-fg uppercase tracking-wider">
              Adjudicados últimos 30 días
            </div>
            {closedDeals.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No hay cierres recientes.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {closedDeals.map((deal) => (
                  <a
                    key={deal.id}
                    href={`/crm/deals/${deal.id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{deal.companyName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {deal.contactName} · {deal.totalPuestos} puestos
                        {deal.closedAt && ` · cerrado ${new Date(deal.closedAt).toLocaleDateString('es-CL')}`}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-status-ok-fg tabular-nums whitespace-nowrap">
                      {formatCLP(Math.round(deal.amount))}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'upcoming' && <HubUpcomingProjects projects={upcomingProjects} />}
        {activeTab === 'leads' && <HubPendingLeads leads={pendingLeads} />}
        {activeTab === 'stale' && (
          <HubStaleDeals
            deals={staleDeals}
            sellerFirstName={sellerFirstName}
            tenantName={closingData.commercialName}
          />
        )}
        {activeTab === 'portal' && <HubPortalRanking users={portalTopUsers} />}
      </div>
    </HubCollapsibleSection>
  );
}
