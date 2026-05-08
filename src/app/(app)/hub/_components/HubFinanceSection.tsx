import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardCheck, Banknote, Wallet } from 'lucide-react';
import { formatCLP } from '../_lib/hub-utils';
import type { HubFinanceSectionProps } from '../_lib/hub-types';
import { Stat } from '@/components/opai-ds';

export function HubFinanceSection({
  financeMetrics,
}: HubFinanceSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-status-warn-soft">
              <Wallet className="h-4 w-4 text-status-warn-fg" />
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
            <Stat
              label="Pendientes de aprobación"
              value={financeMetrics.pendingApprovalCount}
              icon={ClipboardCheck}
              hint={`${formatCLP(financeMetrics.pendingApprovalAmount)} en total`}
              variant="warn"
              className="h-full cursor-pointer transition-all hover:ring-2 hover:ring-primary/25"
            />
          </Link>
          <Link href="/finanzas/rendiciones/pagos" className="block min-w-0">
            <Stat
              label="Aprobadas sin pagar"
              value={financeMetrics.approvedUnpaidCount}
              icon={Banknote}
              hint={`${formatCLP(financeMetrics.approvedUnpaidAmount)} en total`}
              variant="ok"
              className="h-full cursor-pointer transition-all hover:ring-2 hover:ring-primary/25"
            />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
