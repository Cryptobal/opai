import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/opai";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ConfigSubnav } from "@/components/opai";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion");
  }

  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/hub");
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Administración global y por módulo"
        className="mb-6"
      />
      <ConfigSubnav />
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/opai/configuracion/usuarios">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>Usuarios</CardTitle>
              <CardDescription>Roles, accesos y seguridad.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/opai/configuracion/integraciones">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>Integraciones</CardTitle>
              <CardDescription>Gmail y conectores externos.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/opai/configuracion/email-templates">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>Templates email</CardTitle>
              <CardDescription>Plantillas con placeholders.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/opai/configuracion/crm">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>CRM</CardTitle>
              <CardDescription>Pipeline y automatizaciones.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/opai/configuracion/cpq">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>Configuración CPQ</CardTitle>
              <CardDescription>Catálogo, parámetros y pricing.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/opai/configuracion/payroll">
          <Card className="cursor-pointer transition hover:border-primary">
            <CardHeader>
              <CardTitle>Payroll</CardTitle>
              <CardDescription>Parámetros y versiones.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </>
  );
}
