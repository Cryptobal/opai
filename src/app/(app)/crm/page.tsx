/**
 * CRM - Customer Relationship Management
 *
 * Módulo de gestión de clientes y pipeline comercial.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { hasAppAccess } from '@/lib/app-access';
import { PageHeader } from '@/components/opai';
import { CrmSubnav } from '@/components/crm/CrmSubnav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Users, Building, TrendingUp, FileText, Contact, DollarSign } from 'lucide-react';

export default async function CRMPage() {
  // Verificar autenticación y acceso al módulo CRM
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/crm');
  }

  if (!hasAppAccess(session.user.role, 'crm')) {
    redirect('/hub');
  }
  return (
    <>
      <PageHeader
        title="CRM"
        description="Pipeline comercial y gestión de clientes"
        className="mb-6"
      />

      <CrmSubnav />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <Users className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle>Prospectos</CardTitle>
                <CardDescription>
                  Solicitudes entrantes y aprobación manual.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/crm/leads">
              <Button>Ir a prospectos</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
                <Building className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <CardTitle>Clientes</CardTitle>
                <CardDescription>Base de cuentas y contactos.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/crm/accounts">
              <Button variant="outline">Ver clientes</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle>Negocios</CardTitle>
                <CardDescription>Oportunidades y pipeline.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/crm/deals">
              <Button>Ir al pipeline</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/10">
                <Contact className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <CardTitle>Contactos</CardTitle>
                <CardDescription>Personas clave por cliente.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/crm/contacts">
              <Button variant="outline">Ver contactos</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/10">
                <DollarSign className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle>Cotizaciones</CardTitle>
                <CardDescription>Configurador de precios CPQ.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/crm/cotizaciones">
              <Button>Ver cotizaciones</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
                <FileText className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <CardTitle>Reportes</CardTitle>
                <CardDescription>Métricas y conversiones.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              Próximamente
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
