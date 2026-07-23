import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AnticipoProcessClient } from "@/components/payroll/AnticipoProcessClient";

export default async function PayrollAnticiposPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/payroll/anticipos");

  return (
    <div className="min-w-0">
      <AnticipoProcessClient />
    </div>
  );
}
