'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Flame, LayoutGrid, UserPlus } from 'lucide-react';
import { ChipTabs } from '@/components/ui/chip-tabs';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { HubClosingKpis } from './HubClosingKpis';
import { HubHotDealsTable } from './HubHotDealsTable';
import { HubHotDealsMobile } from './HubHotDealsMobile';
import { HubMiniFunnel } from './HubMiniFunnel';
import { HubStaleDeals } from './HubStaleDeals';
import { HubPendingLeads } from './HubPendingLeads';
import { HubPortalRanking } from './HubPortalRanking';
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

export function HubCrmSection({ perms, closingData }: HubClosingSectionProps) {
  const [activeTab, setActiveTab] = useState('hot');
  const [leadsLastSeenCount, setLeadsLastSeenCount] = useState(0);
  const { kpis, hotDeals, staleDeals, pendingLeads, funnel, portalTopUsers } = closingData;

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
    {
      id: 'leads',
      label: 'Leads nuevos',
      badge: leadsUnseenCount,
      badgeVariant: 'alert' as const,
    },
    { id: 'stale', label: '⚠️ Sin actividad', badge: staleDeals.length },
  ];

  return (
    <HubCollapsibleSection
      icon={<span className="h-2.5 w-2.5 rounded-full bg-teal-400 inline-block" />}
      title="Hub de Cierre"
      badge={
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tabular-nums text-teal-400">
            {negotiationFormatted} negociando
          </span>
          <Link
            href="/crm/deals"
            className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <LayoutGrid className="h-3 w-3" /> Kanban
          </Link>
          {perms.canOpenLeads && (
            <Link
              href="/crm/leads/new"
              className="hidden md:inline-flex items-center gap-1 rounded-md bg-teal-600 hover:bg-teal-500 px-2 py-0.5 text-[11px] font-medium text-white transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <UserPlus className="h-3 w-3" /> + Lead
            </Link>
          )}
        </div>
      }
      defaultOpen
    >
      {/* Mobile header actions */}
      <div className="flex items-center gap-2 md:hidden mb-2">
        <Link
          href="/crm/deals"
          className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          <LayoutGrid className="h-3 w-3" /> Kanban
        </Link>
        {perms.canOpenLeads && (
          <Link
            href="/crm/leads/new"
            className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            <UserPlus className="h-3 w-3" /> + Lead
          </Link>
        )}
      </div>

      {/* KPIs — always visible */}
      <HubClosingKpis kpis={kpis} />

      {/* ─── MOBILE LAYOUT (< md) ─── */}
      <div className="md:hidden space-y-3 mt-2">
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
                <p className="text-sm text-muted-foreground">No hay propuestas activas.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  <p className="text-xs font-bold">Propuestas calientes</p>
                  <span className="text-[10px] text-muted-foreground">({hotDeals.length})</span>
                </div>
                <HubHotDealsMobile deals={hotDeals} />
              </>
            )}
            <HubMiniFunnel funnel={funnel} />
          </>
        )}

        {activeTab === 'leads' && <HubPendingLeads leads={pendingLeads} />}
        {activeTab === 'stale' && <HubStaleDeals deals={staleDeals} />}
      </div>

      {/* ─── DESKTOP LAYOUT (≥ md) ─── */}
      <div className="hidden md:grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_420px] gap-4 mt-3 items-start">
        {/* Left column: hot deals table + funnel */}
        <div className="min-w-0 space-y-3">
          {hotDeals.length === 0 ? (
            <div className="rounded-[10px] border border-border bg-card p-6 text-center">
              <Flame className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No hay propuestas activas con engagement.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Envía tu primera cotización desde el pipeline.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                <p className="text-sm font-bold">Propuestas calientes</p>
                <span className="text-[10px] text-teal-400 font-bold tabular-nums bg-teal-500/10 rounded px-1.5 py-0.5">
                  {hotDeals.length}
                </span>
              </div>
              <HubHotDealsTable deals={hotDeals} />
            </>
          )}
          <HubMiniFunnel funnel={funnel} />
        </div>

        {/* Right column: sidebar */}
        <div className="space-y-3 md:sticky md:top-4">
          <HubStaleDeals deals={staleDeals} />
          <HubPendingLeads leads={pendingLeads} />
          <HubPortalRanking users={portalTopUsers} />
        </div>
      </div>
    </HubCollapsibleSection>
  );
}
