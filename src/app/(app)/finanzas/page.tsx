import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, hasModuleAccess, hasCapability } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { PageHeader } from "@/components/opai";
import { Card, CardContent } from "@/components/ui/card";
import {
  Receipt,
  CheckCircle2,
  Wallet,
  BarChart3,
} from "lucide-react";

export default async function FinanzasDashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) {
    redirect("/hub");
  }

  const tenantId = session.user.tenantId ?? (await getDefaultTenantId());

  const [pendingRendiciones, pendingApprovals, pendingPaymentAmount] =
    await Promise.all([
      prisma.financeRendicion.count({
        where: { tenantId, status: { in: ["DRAFT", "SUBMITTED"] } },
      }),
      prisma.financeRendicion.count({
        where: { tenantId, status: { in: ["SUBMITTED", "IN_APPROVAL"] } },
      }),
      prisma.financeRendicion.aggregate({
        where: { tenantId, status: "APPROVED" },
        _sum: { amount: true },
      }),
    ]);

  const amountPending = pendingPaymentAmount._sum.amount ?? 0;

  const fmtCLP = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  });

  const canApprove = hasCapability(perms, "rendicion_approve");
  const canPay = hasCapability(perms, "rendicion_pay");

  const modules = [
    {
      href: "/finanzas/rendiciones",
      title: "Rendiciones",
      description: "Crea y gestiona rendiciones de gastos y kilometraje.",
      icon: Receipt,
      count: pendingRendiciones > 0 ? pendingRendiciones : null,
      countLabel: "pendiente(s)",
      color: "text-emerald-400 bg-emerald-400/10",
      show: true,
    },
    {
      href: "/finanzas/aprobaciones",
      title: "Aprobaciones",
      description: "Revisa y aprueba rendiciones enviadas por tu equipo.",
      icon: CheckCircle2,
      count: pendingApprovals > 0 ? pendingApprovals : null,
      countLabel: "por aprobar",
      color: "text-blue-400 bg-blue-400/10",
      show: canApprove,
    },
    {
      href: "/finanzas/pagos",
      title: "Pagos",
      description: "Procesa pagos manuales o genera archivos bancarios.",
      icon: Wallet,
      count: amountPending > 0 ? fmtCLP.format(amountPending) : null,
      countLabel: "por pagar",
      color: "text-purple-400 bg-purple-400/10",
      show: canPay,
    },
    {
      href: "/finanzas/reportes",
      title: "Reportes",
      description: "Resumen de gastos por tipo, estado y período.",
      icon: BarChart3,
      count: null,
      countLabel: null,
      color: "text-amber-400 bg-amber-400/10",
      show: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        description="Rendiciones de gastos, aprobaciones, pagos y reportes."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.filter((m) => m.show).map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="pt-5 flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.color}`}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                  {item.count !== null && (
                    <p className="mt-2 text-xs text-primary">
                      {item.count} {item.countLabel}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
