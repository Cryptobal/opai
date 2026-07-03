import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { McpConfigClient } from "@/components/configuracion/mcp/McpConfigClient";
import { Server } from "lucide-react";

export default async function McpIntegrationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones/mcp");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    redirect("/opai/configuracion/integraciones");
  }

  return (
    <ConfigPageLayout
      title="Servidor MCP"
      description="Conecta Claude y otros clientes MCP a OPAI con API keys por tenant."
      icon={<Server className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/integraciones"
      backLabel="Integraciones"
    >
      <McpConfigClient baseUrl={getCanonicalSiteUrl()} />
    </ConfigPageLayout>
  );
}
