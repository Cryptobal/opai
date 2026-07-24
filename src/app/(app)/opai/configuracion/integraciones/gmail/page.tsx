import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { Mail } from "lucide-react";
import { GmailConfigClient } from "@/components/configuracion/gmail/GmailConfigClient";

export default async function GmailIntegrationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones/gmail");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Gmail"
      description="Conectá tu cuenta para enviar y registrar correos del CRM"
      icon={<Mail className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/integraciones"
      backLabel="Integraciones"
    >
      <GmailConfigClient />
    </ConfigPageLayout>
  );
}
