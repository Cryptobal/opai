import { Suspense } from "react";
import { TenantsClient } from "@/components/platform/tenants/TenantsClient";
import { Skeleton } from "@/components/opai-ds";

export default function PlatformTenantsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <TenantsClient />
    </Suspense>
  );
}
