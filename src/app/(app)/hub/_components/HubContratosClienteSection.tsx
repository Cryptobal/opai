"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileSignature, AlertTriangle, Clock, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { HubCollapsibleSection } from './HubCollapsibleSection';
import { FORMULA_TOOLTIPS } from '../_lib/hub-formula-tooltips';

interface Contract {
  accountId: string;
  accountName: string;
  contractStart: string | null;
  contractEnd: string | null;
  monthlyCost: number;
  status: 'sin_contrato' | 'vigente' | 'por_vencer' | 'vencido';
  daysUntilEnd: number | null;
}
interface ApiResponse {
  success: boolean;
  summary: { sinContrato: number; porVencer: number; vencidos: number; vigentes: number };
  sinContrato: Contract[];
  porVencer: Contract[];
  vencidos: Contract[];
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('es-CL') : '—';

export function HubContratosClienteSection() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);
  const [tab, setTab] = useState<'sinContrato' | 'porVencer' | 'vencidos'>('porVencer');

  useEffect(() => {
    fetch('/api/hub/contratos-cliente')
      .then((r) => r.json())
      .then((j: ApiResponse) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <HubCollapsibleSection icon={<FileSignature className="h-4 w-4" />} title="Contratos cliente">
        <p className="text-xs text-muted-foreground">Cargando…</p>
      </HubCollapsibleSection>
    );
  }
  if (!data?.success) return null;

  const { summary, sinContrato, porVencer, vencidos } = data;
  const totalAlertas = summary.sinContrato + summary.porVencer + summary.vencidos;
  const list = tab === 'sinContrato' ? sinContrato : tab === 'porVencer' ? porVencer : vencidos;

  return (
    <HubCollapsibleSection
      icon={<FileSignature className="h-4 w-4" />}
      title="Contratos cliente"
      badge={
        <div className="flex items-center gap-2">
          {summary.vencidos > 0 && (
            <Badge variant="outline" className="text-[10px] border-status-danger-border text-status-danger-fg">
              {summary.vencidos} vencidos
            </Badge>
          )}
          {summary.porVencer > 0 && (
            <Badge variant="outline" className="text-[10px] border-status-warn-border text-status-warn-fg">
              {summary.porVencer} por vencer
            </Badge>
          )}
        </div>
      }
      defaultOpen={totalAlertas > 0}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] md:text-xs text-muted-foreground">
          {summary.vigentes} vigentes · {summary.sinContrato} sin contrato · {summary.porVencer} por vencer · {summary.vencidos} vencidos
        </p>
        <button
          type="button"
          onClick={() => setShowFormula((s) => !s)}
          className="text-primary/70 hover:text-primary"
          aria-label="Cómo se calcula"
        >
          <Info className="h-4 w-4" />
        </button>
      </div>

      {showFormula && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{FORMULA_TOOLTIPS.contratosCliente}</p>
        </div>
      )}

      <div className="flex gap-2 mb-3 overflow-x-auto -mx-3 px-3">
        {([
          { id: 'porVencer', label: '⏰ Por vencer (90d)', count: summary.porVencer, color: 'amber' },
          { id: 'vencidos', label: '⚠️ Vencidos', count: summary.vencidos, color: 'red' },
          { id: 'sinContrato', label: '📄 Sin contrato', count: summary.sinContrato, color: 'muted' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] md:text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {t.label} {t.count > 0 && <span className="font-bold ml-1">{t.count}</span>}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-border bg-card/50 p-4 text-center text-xs text-muted-foreground">
          {tab === 'porVencer' && 'Sin contratos por vencer en los próximos 90 días. 👍'}
          {tab === 'vencidos' && 'Sin contratos vencidos. 👍'}
          {tab === 'sinContrato' && 'Todas las cuentas activas tienen contrato registrado.'}
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {list.map((c) => (
              <Link
                key={c.accountId}
                href={`/crm/accounts/${c.accountId}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-accent/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.accountName}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {c.contractStart && `Inicio ${fmtDate(c.contractStart)}`}
                    {c.contractEnd && ` · Fin ${fmtDate(c.contractEnd)}`}
                    {c.daysUntilEnd != null && c.daysUntilEnd >= 0 && ` · vence en ${c.daysUntilEnd} días`}
                    {c.daysUntilEnd != null && c.daysUntilEnd < 0 && ` · vencido hace ${Math.abs(c.daysUntilEnd)} días`}
                  </div>
                </div>
                {c.monthlyCost > 0 && (
                  <div className="text-xs font-bold tabular-nums whitespace-nowrap">
                    {fmtCLP(c.monthlyCost)}
                  </div>
                )}
                {c.status === 'vencido' && <AlertTriangle className="h-4 w-4 text-status-danger-fg shrink-0" />}
                {c.status === 'por_vencer' && <Clock className="h-4 w-4 text-status-warn-fg shrink-0" />}
              </Link>
            ))}
          </div>
        </div>
      )}
    </HubCollapsibleSection>
  );
}
