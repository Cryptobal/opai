import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { ReportQrInventoryClient } from "@/components/ops/ReportQrInventoryClient";

export default async function SenaleticaQrPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/incidentes-terreno/qr");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "tickets")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0 ds-page-enter">
      <PageHero
        icon={<QrCode />}
        iconTone="emerald"
        title="Señalética QR"
        subtitle="lotes de incidencias"
        description="Genera adhesivos, imprímelos y asígnalos a una instalación al escanearlos en terreno."
      />
      <ReportQrInventoryClient canEdit={canEdit(perms, "ops", "tickets")} />
    </div>
  );
}
