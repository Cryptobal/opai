'use client';

import { use, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TenantDetailTabs } from '@/components/platform/TenantDetailTabs';

function TenantDetailContent({ tenantId }: { tenantId: string }) {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/platform/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Detalle del Tenant</h1>
      </div>
      <Suspense>
        <TenantDetailTabs tenantId={tenantId} />
      </Suspense>
    </div>
  );
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);

  return <TenantDetailContent tenantId={tenantId} />;
}
