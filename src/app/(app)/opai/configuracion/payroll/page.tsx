import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { ConfigSubnav } from "@/components/opai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PayrollConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/payroll");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
  }

  return (
    <>
      <PageHeader
        title="Configuración Payroll"
        description="Parámetros y supuestos"
        className="mb-6"
      />
      <ConfigSubnav />
      <div className="grid gap-4 md:grid-cols-2">
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
