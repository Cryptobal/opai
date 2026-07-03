import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { IntegrationsGmailClient } from "@/components/opai";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { prisma } from "@/lib/prisma";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plug, Slack, ChevronRight, Server } from "lucide-react";

export default async function IntegracionesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  const tenantId = session.user.tenantId;
  const isAdmin = ["owner", "admin"].includes(session.user.role ?? "");
  const [gmailAccount, slackWorkspace, mcpKeyCount] = await Promise.all([
    prisma.crmEmailAccount.findFirst({
      where: {
        tenantId,
        userId: session.user.id,
        provider: "gmail",
        status: "active",
      },
    }),
    prisma.slackWorkspace.findUnique({ where: { tenantId }, select: { status: true } }),
    prisma.mcpApiKey.count({ where: { tenantId, revokedAt: null } }),
  ]);
  const slackConnected = slackWorkspace?.status === "ACTIVE";
  const mcpConnected = mcpKeyCount > 0;

  return (
    <ConfigPageLayout
      title="Integraciones"
      description="Configura conexiones globales para el CRM"
      icon={<Plug className="h-[18px] w-[18px]" />}
    >
      <div className="space-y-4">
        <IntegrationsGmailClient connected={Boolean(gmailAccount)} />

        <Link href="/opai/configuracion/integraciones/slack" className="block">
          <Card className="transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                  <Slack className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle>Slack</CardTitle>
                  <CardDescription>Envía notificaciones de OPAI a canales de Slack.</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={slackConnected ? "success" : "secondary"}>
                  {slackConnected ? "Conectado" : "Sin conectar"}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>

        {isAdmin && (
          <Link href="/opai/configuracion/integraciones/mcp" className="block">
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle>Servidor MCP</CardTitle>
                    <CardDescription>Opera OPAI desde Claude y otros clientes MCP con API keys.</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={mcpConnected ? "success" : "secondary"}>
                    {mcpConnected ? `${mcpKeyCount} key${mcpKeyCount === 1 ? "" : "s"}` : "Sin keys"}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          </Link>
        )}
      </div>
    </ConfigPageLayout>
  );
}
