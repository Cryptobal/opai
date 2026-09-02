import { Suspense } from "react";
import { TenantDetailClient } from "@/components/platform/tenant-detail/TenantDetailClient";
import { Skeleton } from "@/components/opai-ds";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <TenantDetailClient tenantId={tenantId} />
    </Suspense>
  );
}
