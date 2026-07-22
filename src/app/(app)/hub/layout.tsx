import type { ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import { ModuleSubNav, PageHero } from "@/components/opai-ds";
import { HubIntegrationStatus } from "./_components/HubIntegrationStatus";
import {
  getHubIntegrationStatus,
  getHubRequestContext,
} from "./_lib/hub-context";

export default async function HubLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { firstName, tenantId, userId } = await getHubRequestContext();
  const integrations = await getHubIntegrationStatus(tenantId, userId);

  return (
    <div className="min-w-0 space-y-5">
      <ModuleSubNav
        moduleKey="hub"
        disableAutoSuppress
        className="lg:sticky lg:top-12 lg:z-10 lg:bg-background/95"
      />

      <PageHero
        title={`Buenos días, ${firstName}`}
        subtitle="Centro de comando"
        description="Todo lo importante para mover el negocio hoy, agrupado por área y sin perder el contexto."
        icon={<LayoutDashboard />}
        iconVariant="brand"
        actions={<HubIntegrationStatus status={integrations} />}
      />

      <div className="min-w-0">{children}</div>
    </div>
  );
}
