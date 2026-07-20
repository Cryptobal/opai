import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { HardDrive } from "lucide-react";
import { GoogleDriveConfigClient } from "@/components/configuracion/google-drive/GoogleDriveConfigClient";

export default async function GoogleDriveIntegrationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/integraciones/google-drive");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "integraciones")) {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Google Drive"
      description="Espejo documental unidireccional OPAI → Drive (cuenta corporativa del tenant)"
      icon={<HardDrive className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/integraciones"
      backLabel="Integraciones"
    >
      <GoogleDriveConfigClient />
    </ConfigPageLayout>
  );
}
