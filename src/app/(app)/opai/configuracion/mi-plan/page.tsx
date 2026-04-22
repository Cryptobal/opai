import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { MiPlanClient } from "@/components/configuracion/MiPlanClient";
import { CreditCard } from "lucide-react";

export const metadata = { title: "Mi Plan — Configuración" };

export default async function MiPlanPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/mi-plan");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/opai/configuracion");
  }

  return (
    <ConfigPageLayout
      title="Mi Plan"
      description="Plan actual, módulos activos, add-ons y solicitudes de upgrade."
      icon={<CreditCard className="h-[18px] w-[18px]" />}
    >
      <MiPlanClient />
    </ConfigPageLayout>
  );
}
