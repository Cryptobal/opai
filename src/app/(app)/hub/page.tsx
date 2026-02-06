/**
 * Hub OPAI - Centro de control principal
 * 
 * Dashboard ejecutivo con acceso a todas las aplicaciones del ecosistema.
 * Visible solo para roles owner/admin.
 * 
 * Muestra:
 * - KPIs globales de Docs (presentaciones, envíos, vistas)
 * - Quick actions (Nueva Propuesta, Invitar Usuario)
 * - Apps launcher (Docs, CRM, CPQ, Admin)
 * - Work queue (propuestas sin leer)
 * - Activity feed (eventos recientes)
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasHubAccess } from '@/lib/access';
import { PageHeader } from '@/components/opai';
import { KpiCard } from '@/components/opai/KpiCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { 
  Plus, 
  UserPlus, 
  FileText, 
  Send, 
  Eye, 
  Mail,
  LayoutGrid,
  Users,
  DollarSign,
  Settings,
  Clock,
  TrendingUp,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HubPage() {
  // Verificar autenticación y autorización
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/hub');
  }

  // Verificar que sea admin o owner
  if (!hasHubAccess(session.user.role)) {
    redirect('/opai/inicio');
  }

  const tenantId = session.user.tenantId;

  // Obtener métricas reales de Docs
  const presentations = await prisma.presentation.findMany({
    where: { tenantId },
    include: {
      views: { orderBy: { viewedAt: 'desc' } },
      template: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calcular KPIs
  const total = presentations.length;
  const sent = presentations.filter(p => p.status === 'sent').length;
  const viewed = presentations.filter(p => p.viewCount > 0).length;
  const unread = presentations.filter(p => p.status === 'sent' && p.viewCount === 0).length;
  const viewRate = sent > 0 ? Math.round((viewed / sent) * 100) : 0;
  const totalViews = presentations.reduce((sum, p) => sum + p.viewCount, 0);

  // Propuestas sin leer (últimas 5)
  const unreadPresentations = presentations
    .filter(p => p.status === 'sent' && p.viewCount === 0)
    .slice(0, 5);

  // Actividad reciente (últimas visualizaciones)
  const recentActivity = presentations
    .filter(p => p.lastViewedAt)
    .sort((a, b) => {
      const dateA = a.lastViewedAt ? new Date(a.lastViewedAt).getTime() : 0;
      const dateB = b.lastViewedAt ? new Date(b.lastViewedAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  return (
    <>
      {/* Page Header */}
      <PageHeader
        title="Inicio"
        description="Centro de control OPAI Suite"
        className="mb-6"
      />

      {/* Quick Actions */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/opai/templates">
          <Button size="default" className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Propuesta
          </Button>
        </Link>
        <Link href="/opai/usuarios">
          <Button variant="outline" size="default" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Invitar Usuario
          </Button>
        </Link>
      </div>

      {/* KPIs Grid - Minimalista */}
      <div className="mb-5 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total"
          value={total}
          description="propuestas"
          icon={<FileText className="h-4 w-4" />}
        />
        <KpiCard
          title="Enviadas"
          value={sent}
          icon={<Send className="h-4 w-4" />}
          trend={sent > 0 ? 'up' : 'neutral'}
        />
        <KpiCard
          title="Vistas"
          value={viewed}
          description={`${totalViews} visualizaciones`}
          icon={<Eye className="h-4 w-4" />}
          trend={viewed > 0 ? 'up' : 'neutral'}
        />
        <KpiCard
          title="Sin Leer"
          value={unread}
          description={`${viewRate}% tasa`}
          icon={<Mail className="h-4 w-4" />}
          trend={unread > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Apps Launcher */}
      <div className="mb-6">
        <h2 className="mb-3 text-base font-semibold">Aplicaciones</h2>
        <div className="grid auto-rows-fr gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* Docs - Operativo */}
          <Link href="/opai/inicio">
            <Card className="flex h-full cursor-pointer flex-col transition-all hover:border-primary hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <FileText className="h-4 w-4" />
                  </div>
                  <Badge variant="default" className="text-xs">Activo</Badge>
                </div>
                <CardTitle className="text-sm">Docs</CardTitle>
                <CardDescription className="text-xs">
                  Presentaciones comerciales
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* CRM - Placeholder */}
          <Link href="/crm">
            <Card className="flex h-full cursor-pointer flex-col opacity-75 transition-all hover:border-muted-foreground hover:opacity-100">
              <CardHeader className="pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10 text-green-500">
                    <Users className="h-4 w-4" />
                  </div>
                  <Badge variant="outline" className="text-xs">Próximamente</Badge>
                </div>
                <CardTitle className="text-sm">CRM</CardTitle>
                <CardDescription className="text-xs">
                  Gestión de clientes
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* CPQ - Placeholder */}
          <Link href="/cpq">
            <Card className="flex h-full cursor-pointer flex-col opacity-75 transition-all hover:border-muted-foreground hover:opacity-100">
              <CardHeader className="pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <Badge variant="outline" className="text-xs">Próximamente</Badge>
                </div>
                <CardTitle className="text-sm">CPQ</CardTitle>
                <CardDescription className="text-xs">
                  Configurador de precios
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {/* Admin - Operativo */}
          <Link href="/opai/usuarios">
            <Card className="flex h-full cursor-pointer flex-col transition-all hover:border-primary hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                    <Settings className="h-4 w-4" />
                  </div>
                  <Badge variant="default" className="text-xs">Activo</Badge>
                </div>
                <CardTitle className="text-sm">Admin</CardTitle>
                <CardDescription className="text-xs">
                  Usuarios y permisos
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>

      {/* Two Column Layout: Work Queue + Activity Feed */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Work Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Cola de Trabajo
            </CardTitle>
            <CardDescription>Propuestas pendientes de lectura</CardDescription>
          </CardHeader>
          <CardContent>
            {unreadPresentations.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay propuestas sin leer
              </div>
            ) : (
              <div className="space-y-3">
                {unreadPresentations.map((p) => {
                  const clientData = p.clientData as any;
                  const clientName = clientData?.client_name || clientData?.nombre_cliente || 'Cliente';
                  
                  return (
                    <Link
                      key={p.id}
                      href={`/opai/inicio?highlight=${p.id}`}
                      className="block rounded-lg border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <p className="font-medium leading-none">{clientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.recipientEmail || 'Sin email'}
                          </p>
                        </div>
                        <Badge variant="secondary">Sin leer</Badge>
                      </div>
                      {p.emailSentAt && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Enviada {new Date(p.emailSentAt).toLocaleDateString('es-CL')}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Actividad Reciente
            </CardTitle>
            <CardDescription>Últimas visualizaciones</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hay actividad reciente
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((p) => {
                  const clientData = p.clientData as any;
                  const clientName = clientData?.client_name || clientData?.nombre_cliente || 'Cliente';
                  const lastView = p.lastViewedAt ? new Date(p.lastViewedAt) : null;
                  
                  return (
                    <Link
                      key={p.id}
                      href={`/p/${p.uniqueId}`}
                      target="_blank"
                      className="block rounded-lg border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1">
                          <p className="font-medium leading-none">{clientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.viewCount} {p.viewCount === 1 ? 'vista' : 'vistas'}
                          </p>
                        </div>
                        <Badge variant="outline">
                          <Eye className="mr-1 h-3 w-3" />
                          {p.viewCount}
                        </Badge>
                      </div>
                      {lastView && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Última vista: {lastView.toLocaleDateString('es-CL')} {lastView.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
