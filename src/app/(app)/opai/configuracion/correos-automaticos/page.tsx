import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { TransactionalEmailMatrixClient } from "@/components/configuracion/TransactionalEmailMatrixClient";
import { Mail } from "lucide-react";

export const metadata = { title: "Correos automáticos — Configuración" };

export default async function CorreosAutomaticosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/correos-automaticos");
  }
  if (session.user.role !== "owner" && session.user.role !== "admin") {
    redirect("/opai/configuracion");
  }
  return (
    <ConfigPageLayout
      title="Correos automáticos"
      description="Activa o desactiva los correos transaccionales que OPAI envía desde tu empresa. Los marcados como críticos no se pueden desactivar."
      icon={<Mail className="h-[18px] w-[18px]" />}
    >
      <TransactionalEmailMatrixClient />
    </ConfigPageLayout>
  );
}
