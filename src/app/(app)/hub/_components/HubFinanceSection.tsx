import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, Banknote, Wallet } from 'lucide-react';
import { formatCLP } from '../_lib/hub-utils';
import type { HubFinanceSectionProps } from '../_lib/hub-types';
import { KpiCard } from '@/components/opai';

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
          <Link href="/finanzas?tab=aprobaciones" className="block min-w-0">
            <KpiCard
              title="Pendientes de aprobación"
              value={financeMetrics.pendingApprovalCount}
              icon={<ClipboardCheck className="h-4 w-4" />}
              description={`${formatCLP(financeMetrics.pendingApprovalAmount)} en total`}
              variant="amber"
              className="h-full cursor-pointer transition-all hover:ring-2 hover:ring-primary/25"
            />
          </Link>
          <Link href="/finanzas?tab=pagos" className="block min-w-0">
            <KpiCard
              title="Aprobadas sin pagar"
              value={financeMetrics.approvedUnpaidCount}
              icon={<Banknote className="h-4 w-4" />}
              description={`${formatCLP(financeMetrics.approvedUnpaidAmount)} en total`}
              variant="emerald"
              className="h-full cursor-pointer transition-all hover:ring-2 hover:ring-primary/25"
            />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
