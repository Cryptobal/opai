'use client';

/**
 * DocumentosContent — Refactored
 *
 * Desktop: Métricas en fila horizontal compacta (~60px) con separadores verticales
 * Mobile: Métricas en fila de 4 (~50px), colapsa al hacer scroll a resumen sticky
 * Conversión: ratio vista/envío legible
 */

import { useState, useEffect, useRef } from 'react';
import { PresentationsList } from '@/components/admin/PresentationsList';

interface Stats {
  total: number;
  sent: number;
  viewed: number;
  pending: number;
  opened: number;
  clicked: number;
  totalViews: number;
  totalOpens: number;
  totalClicks: number;
}

interface DocumentosContentProps {
  presentations: any[];
  stats: Stats;
  conversionRate: number;
}

export function DocumentosContent({ presentations, stats, conversionRate }: DocumentosContentProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const metricsRef = useRef<HTMLDivElement>(null);

  const handleKpiClick = (filter: string) => {
    setActiveFilter(activeFilter === filter ? 'all' : filter);
  };

  // Mobile: colapsar métricas al scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsCollapsed(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-1px 0px 0px 0px' }
    );
    if (metricsRef.current) observer.observe(metricsRef.current);
    return () => observer.disconnect();
  }, []);

  const conversionDisplay = stats.sent > 0
    ? `${(stats.viewed / stats.sent).toFixed(1)}:1`
    : '—';

  const kpis = [
    { key: 'all', label: 'Total', value: stats.total, color: '' },
    { key: 'sent', label: 'Enviadas', value: stats.sent, color: 'text-emerald-400' },
    { key: 'viewed', label: 'Vistas', value: stats.viewed, sub: `${stats.totalViews} total`, color: 'text-blue-400' },
    { key: 'pending', label: 'Sin Leer', value: stats.pending, color: 'text-amber-400' },
  ];

  return (
    <>
      {/* Collapsed sticky summary — mobile only */}
      {isCollapsed && (
        <div className="lg:hidden sticky top-0 z-20 px-4 py-2 bg-background/80 backdrop-blur-xl border-b border-border text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{stats.total}</span> propuestas
          <span className="mx-1.5 text-muted-foreground/30">·</span>
          <span className="font-semibold text-blue-400">{stats.totalViews}</span> vistas
          <span className="mx-1.5 text-muted-foreground/30">·</span>
          <span className="font-semibold text-amber-400">{stats.pending}</span> sin leer
        </div>
      )}

      {/* KPI Metrics */}
      <div ref={metricsRef} className="mb-4">
        {/* Desktop: fila horizontal con separadores */}
        <div className="hidden sm:flex items-stretch rounded-lg border border-border bg-card divide-x divide-border">
          {kpis.map((kpi) => (
            <button
              key={kpi.key}
              onClick={() => handleKpiClick(kpi.key)}
              className={`flex-1 py-3 px-4 text-left transition-all hover:bg-accent/30 ${
                activeFilter === kpi.key ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : ''
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {kpi.label}
              </p>
              <p className={`text-2xl font-bold font-mono tracking-tight mt-0.5 ${kpi.color}`}>
                {kpi.value}
              </p>
              {kpi.sub && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{kpi.sub}</p>
              )}
            </button>
          ))}

          {/* Conversión */}
          <div className="flex-1 py-3 px-4 text-left">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Conversión
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight mt-0.5 text-purple-400">
              {conversionDisplay}
            </p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">vista/envío</p>
          </div>
        </div>

        {/* Mobile: fila horizontal de 4, compacta */}
        <div className="sm:hidden grid grid-cols-4 gap-1.5">
          {kpis.map((kpi) => (
            <button
              key={kpi.key}
              onClick={() => handleKpiClick(kpi.key)}
              className={`rounded-lg border py-2.5 px-2 text-center transition-all ${
                activeFilter === kpi.key
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
                {kpi.label}
              </p>
              <p className={`text-lg font-bold font-mono mt-0.5 ${kpi.color}`}>
                {kpi.value}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Presentations List */}
      <PresentationsList
        presentations={presentations}
        initialFilter={activeFilter}
      />
    </>
  );
}
