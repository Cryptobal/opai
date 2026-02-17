import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { ConfigBackLink } from "@/components/opai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { BonosCatalogManager } from "@/components/payroll/BonosCatalogManager";
import { HolidaysManager } from "@/components/payroll/HolidaysManager";

export default async function PayrollConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/payroll");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "config", "payroll")) {
    redirect("/opai/configuracion");
  }

  return (
    <>
      <ConfigBackLink />
      <PageHeader
        title="Configuración Payroll"
        description="Parámetros, bonos y supuestos para remuneraciones"
      />

      {/* Feriados */}
      <HolidaysManager />

      {/* Catálogo de bonos */}
      <BonosCatalogManager />

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Parámetros base</CardTitle>
            <CardDescription>UF, UTM y supuestos.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximo paso: editor de parámetros y versiones.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Versionado</CardTitle>
            <CardDescription>Historial y vigencia.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximo paso: control de vigencia por periodo.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
