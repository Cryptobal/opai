import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasCapability } from "@/lib/permissions-server";
import { BancaTabsHeader } from "@/components/finance/BancaTabsHeader";
import { CuadraturaClient } from "@/components/finance/cashflow/CuadraturaClient";
import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";

export default async function CuadraturaPage() {
  const session = await auth();
  if (!session?.user)
    redirect("/opai/login?callbackUrl=/finanzas/flujo-caja/cuadratura");
  const perms = await resolvePagePerms(session.user);
  if (!hasCapability(perms, "cashflow_view")) redirect("/finanzas");

  const canManage = hasCapability(perms, "cashflow_manage");

  return (
    <div className="space-y-4 min-w-0">
      <BancaTabsHeader active="cashflow" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/finanzas/flujo-caja"
            className="text-[13px] text-ds-text-2 hover:text-ds-text-1"
          >
            ← Flujo de caja
          </Link>
          <span className="text-ds-text-4">/</span>
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-ds-text-2" /> Cuadratura
          </h1>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Mantén tu flujo de caja siempre cuadrado con el saldo real de tus
        cuentas. Resuelve movimientos huérfanos, occurrences no cumplidas, y
        cierra diferencias residuales con ajustes oficiales.
      </p>
      <CuadraturaClient canManage={canManage} />
    </div>
  );
}
