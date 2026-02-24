import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { SueldosRutListClient } from "@/components/payroll/SueldosRutListClient";

export default async function SueldosRutPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/personas/guardias/sueldos-rut");

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Sueldos por RUT"
        description="Estructuras de sueldo asignadas directamente a guardias (tienen prioridad sobre el sueldo de la instalación)"
      />
      <SueldosRutListClient />
    </div>
  );
}
