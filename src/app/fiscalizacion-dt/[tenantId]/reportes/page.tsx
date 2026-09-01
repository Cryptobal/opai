import { Suspense } from "react";
import { getAppVersion } from "@/lib/app-version";
import { ReportesClient } from "@/components/fiscalizacion-dt/ReportesClient";

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return (
    <Suspense fallback={<p className="p-6 text-[13px] text-ds-text-3">Cargando…</p>}>
      <ReportesClient version={getAppVersion()} tenantId={tenantId} />
    </Suspense>
  );
}
