"use client";

import type { Payment, PendingRendicion } from "@/components/finance/PagosTab";
import { PagosTab } from "@/components/finance/PagosTab";

interface Props {
  payments: Payment[];
  pendingRendiciones: PendingRendicion[];
}

export function PagosPageClient({ payments, pendingRendiciones }: Props) {
  return (
    <div className="space-y-4 min-w-0">
      <PagosTab payments={payments} pendingRendiciones={pendingRendiciones} />
    </div>
  );
}
