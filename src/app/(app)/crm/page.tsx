/**
 * CRM - Customer Relationship Management
 * 
 * Módulo de gestión de clientes (próximamente).
 * Incluirá integración con Zoho CRM, pipeline de ventas, y reportes.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { hasAppAccess } from '@/lib/app-access';
import { PageHeader } from '@/components/opai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Users, Building, TrendingUp, DollarSign, Calendar, FileText } from 'lucide-react';

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
        description="Customer Relationship Management"
        className="mb-6"
      />

      {/* Empty State Premium */}
      <div className="flex min-h-[600px] items-center justify-center">
        <Card className="max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Users className="h-8 w-8 text-green-500" />
            </div>
            <Badge variant="outline" className="mx-auto mb-4 w-fit">
              Próximamente
            </Badge>
            <CardTitle className="text-2xl">CRM OPAI</CardTitle>
            <CardDescription className="text-base">
              Gestión completa de relaciones con clientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Features Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <Building className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">Base de Clientes</p>
                  <p className="text-sm text-muted-foreground">
                    Gestión centralizada de contactos y cuentas
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium">Pipeline de Ventas</p>
                  <p className="text-sm text-muted-foreground">
                    Seguimiento de oportunidades y forecast
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <Calendar className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Gestión de Actividades</p>
                  <p className="text-sm text-muted-foreground">
                    Tareas, llamadas, reuniones y seguimientos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                  <FileText className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="font-medium">Reportes y Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Métricas de desempeño y conversión
                  </p>
                </div>
              </div>
            </div>

            {/* Roadmap */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 font-semibold">Roadmap</h3>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Integración bidireccional con Zoho CRM
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Sincronización de contactos y oportunidades
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Dashboard ejecutivo con KPIs de ventas
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  Automatización de workflows
                </li>
              </ul>
            </div>

            {/* CTA */}
            <div className="flex justify-center gap-3 pt-4">
              <Link href="/hub">
                <Button variant="outline">
                  Volver al Hub
                </Button>
              </Link>
              <Link href="/opai/inicio">
                <Button>
                  Ir a Docs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
