import { Suspense } from "react";
import { CatalogClient } from "@/components/platform/catalog/CatalogClient";
import { Skeleton } from "@/components/opai-ds";

export default function CatalogPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <CatalogClient />
    </Suspense>
  );
}
