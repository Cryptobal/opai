"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Info, AlertTriangle } from 'lucide-react';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { FORMULA_TOOLTIPS } from '../_lib/hub-formula-tooltips';

interface InstHealth {
  id: string;
  name: string;
  score: number;
  avgRating: number | null;
  daysSinceLastVisit: number | null;
  openFindingsCount: number;
  overdueFindingsCount: number;
  dotationCompliance: number | null;
  checklistCompliance: number | null;
}
interface ApiResponse { success: boolean; installations: InstHealth[]; }

function scoreColor(score: number): string {
  if (score < 40) return 'bg-red-500/20 text-red-400 border-red-500/40';
  if (score < 70) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
  return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
}

export function HubInstallationHealthSection() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    fetch('/api/hub/installations-health')
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data?.success || data.installations.length === 0) return null;

  const worstScore = data.installations[0]?.score ?? 100;

  return (
    <HubCollapsibleSection
      icon={<Activity className="h-4 w-4" />}
      title="Salud por instalación"
      badge={
        worstScore < 70 ? (
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5 mr-1" />
            Atención
          </Badge>
        ) : undefined
      }
      defaultOpen={worstScore < 70}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] md:text-xs text-muted-foreground">
          Top 5 instalaciones con menor score operacional
        </p>
        <button
          type="button"
          onClick={() => setShowFormula((s) => !s)}
          className="text-muted-foreground hover:text-primary"
          aria-label="Cómo se calcula"
        >
          <Info className="h-3 w-3 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {showFormula && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{FORMULA_TOOLTIPS.installationHealth}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {data.installations.map((inst) => (
          <Link
            key={inst.id}
            href={`/ops/supervision/dashboard?installation=${inst.id}`}
            className="rounded-lg border border-border bg-card p-3 hover:ring-2 hover:ring-primary/25 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium truncate">{inst.name}</p>
              </div>
              <div className={`px-2 py-0.5 rounded-full border text-xs md:text-sm font-bold tabular-nums ${scoreColor(inst.score)}`}>
                {inst.score}
              </div>
            </div>
            <div className="space-y-1 text-[10px] md:text-xs text-muted-foreground">
              {inst.daysSinceLastVisit != null && (
                <div className="flex justify-between">
                  <span>Última visita</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {inst.daysSinceLastVisit === 0 ? 'Hoy' : `${inst.daysSinceLastVisit}d`}
                  </span>
                </div>
              )}
              {inst.openFindingsCount > 0 && (
                <div className="flex justify-between">
                  <span>Hallazgos abiertos</span>
                  <span className={`tabular-nums font-medium ${inst.overdueFindingsCount > 0 ? 'text-red-400' : 'text-foreground'}`}>
                    {inst.openFindingsCount}{inst.overdueFindingsCount > 0 ? ` (${inst.overdueFindingsCount} vencidos)` : ''}
                  </span>
                </div>
              )}
              {inst.dotationCompliance != null && (
                <div className="flex justify-between">
                  <span>Dotación</span>
                  <span className="tabular-nums font-medium text-foreground">{Math.round(inst.dotationCompliance)}%</span>
                </div>
              )}
              {inst.avgRating != null && (
                <div className="flex justify-between">
                  <span>Rating</span>
                  <span className="tabular-nums font-medium text-foreground">{inst.avgRating.toFixed(1)} ★</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </HubCollapsibleSection>
  );
}
