import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SueldosRutListClient } from "@/components/payroll/SueldosRutListClient";

export default async function SueldosRutPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/personas/guardias/sueldos-rut");

  return (
    <div className="min-w-0">
      <SueldosRutListClient />
    </div>
  );
}
