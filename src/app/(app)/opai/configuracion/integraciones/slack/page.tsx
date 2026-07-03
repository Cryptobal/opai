import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { Slack } from "lucide-react";
import { SlackConfigClient } from "@/components/configuracion/slack/SlackConfigClient";
import { SlackBridges } from "@/components/configuracion/slack/SlackBridges";

export default async function SlackIntegrationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones/slack");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  const ws = await prisma.slackWorkspace.findUnique({
    where: { tenantId: session.user.tenantId },
    select: { status: true },
  });
  const connected = ws?.status === "ACTIVE";

  return (
    <ConfigPageLayout
      title="Slack"
      description="Conecta tu workspace y rutea las notificaciones de OPAI a canales de Slack"
      icon={<Slack className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/integraciones"
      backLabel="Integraciones"
    >
      <div className="space-y-4">
        <SlackConfigClient />
        {connected && <SlackBridges />}
      </div>
    </ConfigPageLayout>
  );
}
