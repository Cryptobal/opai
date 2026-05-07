import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHero } from "@/components/opai-ds";
import { Wallet } from "lucide-react";
import { AnticipoProcessClient } from "@/components/payroll/AnticipoProcessClient";

export default async function PayrollAnticiposPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/anticipos");

  return (
    <div className="space-y-6 min-w-0">
<PageHero
        icon={<Wallet />}
        iconTone="amber"
        title="Anticipos"
        subtitle="pagos mensuales"
        description="Procesos de pago de anticipos mensuales."
      />
      <AnticipoProcessClient />
    </div>
  );
}
