"use client";

import type { Payment, PendingRendicion } from "@/components/finance/PagosTab";
import { PagosTab } from "@/components/finance/PagosTab";

interface Props {
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
  historyOnly?: boolean;
}

export function PagosPageClient({
  payments,
  pendingRendiciones,
  historyOnly,
}: Props) {
  return (
    <div className="space-y-4 min-w-0">
      <PagosTab
        payments={payments}
        pendingRendiciones={pendingRendiciones}
        historyOnly={historyOnly}
      />
    </div>
  );
}
