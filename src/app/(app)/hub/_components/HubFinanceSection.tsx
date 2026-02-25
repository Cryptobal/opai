import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, Banknote, Wallet } from 'lucide-react';
import { formatCLP } from '../_lib/hub-utils';
import type { HubFinanceSectionProps } from '../_lib/hub-types';

export function HubFinanceSection({
  financeMetrics,
}: HubFinanceSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15">
              <Wallet className="h-4 w-4 text-amber-400" />
            </div>
            Finanzas - Rendiciones
          </CardTitle>
          <Link
            href="/finanzas"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ir a Finanzas
          </Link>
        </div>
        <CardDescription>
          Resumen de rendiciones pendientes de gestión.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/finanzas?tab=aprobaciones"
            className="rounded-lg border border-border bg-card p-4 transition-all hover:bg-accent/40 hover:shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
              <div className="p-1 rounded-md bg-amber-500/15">
                <ClipboardCheck className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <p className="text-[11px] uppercase tracking-wider">
                Pendientes de aprobación
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {financeMetrics.pendingApprovalCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{formatCLP(financeMetrics.pendingApprovalAmount)}</span> en total
            </p>
          </Link>
          <Link
            href="/finanzas?tab=pagos"
            className="rounded-lg border border-border bg-card p-4 transition-all hover:bg-accent/40 hover:shadow-sm relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <div className="flex items-center gap-2 text-muted-foreground mt-1">
              <div className="p-1 rounded-md bg-emerald-500/15">
                <Banknote className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <p className="text-[11px] uppercase tracking-wider">
                Aprobadas sin pagar
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold">
              {financeMetrics.approvedUnpaidCount}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{formatCLP(financeMetrics.approvedUnpaidAmount)}</span> en total
            </p>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
