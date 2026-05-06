'use client';

import { use, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TenantDetailTabs } from '@/components/platform/TenantDetailTabs';
import { TenantDetailHeader } from '@/components/platform/TenantDetailHeader';

function TenantDetailContent({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-6">
      <Link
        href="/platform/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Tenants
      </Link>
      <Suspense>
        <TenantDetailHeader tenantId={tenantId} />
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
