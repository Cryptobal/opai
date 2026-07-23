import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PayrollPeriodListClient } from "@/components/payroll/PayrollPeriodListClient";

export default async function PayrollPeriodosPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/periodos");

  return (
    <div className="min-w-0">
      <PayrollPeriodListClient />
    </div>
  );
}
