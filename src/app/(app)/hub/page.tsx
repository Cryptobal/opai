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
import { hasAppAccess } from '@/lib/app-access';
import {
  hasAnyConfigSubmoduleAccess,
  hasConfigSubmoduleAccess,
  hasCrmSubmoduleAccess,
  hasDocsSubmoduleAccess,
} from '@/lib/module-access';
import { timeAgo } from '@/lib/utils';
import { PageHeader, Avatar } from '@/components/opai';
import { KpiCard } from '@/components/opai/KpiCard';
import { CrmGlobalSearch } from '@/components/crm/CrmGlobalSearch';
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
  Users,
  Settings,
  Clock,
  TrendingUp,
  Calculator,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HubPage() {
  // Verificar autenticación y autorización
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/hub');
  }
  const role = session.user.role;

  // Verificar acceso al módulo Hub (App Access)
  if (!hasAppAccess(role, 'hub')) {
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

  // Saludo personalizado
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = session.user.name?.split(' ')[0] || 'Usuario';
  const subtitle = unread > 0
    ? `Tienes ${unread} ${unread === 1 ? 'propuesta sin leer' : 'propuestas sin leer'}`
    : 'Todo al día';
  const canCreateProposal = hasDocsSubmoduleAccess(role, 'document_editor');
  const canInviteUsers = hasConfigSubmoduleAccess(role, 'users');
  const canUseCrmSearch = hasCrmSubmoduleAccess(role, 'overview');
  const appsLauncher = [
    {
      href: '/opai/inicio',
      icon: FileText,
      title: 'Docs',
      desc: 'Presentaciones',
      color: 'text-blue-400 bg-blue-400/10',
      show: hasAppAccess(role, 'docs'),
    },
    {
      href: '/crm',
      icon: Users,
      title: 'CRM',
      desc: 'Clientes',
      color: 'text-emerald-400 bg-emerald-400/10',
      show: hasAppAccess(role, 'crm'),
    },
    {
      href: '/payroll',
      icon: Calculator,
      title: 'Payroll',
      desc: 'Liquidaciones',
      color: 'text-purple-400 bg-purple-400/10',
      show: hasAppAccess(role, 'payroll'),
    },
    {
      href: '/opai/configuracion/usuarios',
      icon: Settings,
      title: 'Config',
      desc: 'Ajustes',
      color: 'text-amber-400 bg-amber-400/10',
      show: hasAnyConfigSubmoduleAccess(role),
    },
  ].filter((app) => app.show);

  return (
    <div className="space-y-6">
      {/* Page Header + Indicadores */}
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={subtitle}
      />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {canCreateProposal && (
          <Link href="/opai/templates">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Propuesta
            </Button>
          </Link>
        )}
        {canInviteUsers && (
          <Link href="/opai/configuracion/usuarios">
            <Button variant="outline" size="sm" className="gap-2">
              <UserPlus className="h-4 w-4" />
              Invitar Usuario
            </Button>
          </Link>
        )}
      </div>

      {canUseCrmSearch && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Buscador CRM</CardTitle>
            <CardDescription>
              Busca contactos, cuentas, negocios, cotizaciones e instalaciones sin salir de Inicio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CrmGlobalSearch />
          </CardContent>
        </Card>
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
      <div>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Aplicaciones</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {appsLauncher.map((app) => (
            <Link key={app.href} href={app.href}>
              <div className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-all hover:bg-accent/40 hover:shadow-md cursor-pointer">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${app.color}`}>
                  <app.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{app.title}</p>
                  <p className="text-xs text-muted-foreground">{app.desc}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Work Queue + Activity Feed */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:gap-6">
        {/* Work Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
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
                      <div className="flex items-start gap-3">
                        <Avatar name={clientName} size="sm" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="font-medium leading-none truncate">{clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {p.recipientEmail || 'Sin email'}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">Sin leer</Badge>
                      </div>
                      {p.emailSentAt && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Enviada {timeAgo(p.emailSentAt)}
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
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
                      <div className="flex items-start gap-3">
                        <Avatar name={clientName} size="sm" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="font-medium leading-none truncate">{clientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.viewCount} {p.viewCount === 1 ? 'vista' : 'vistas'}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          <Eye className="mr-1 h-3 w-3" />
                          {p.viewCount}
                        </Badge>
                      </div>
                      {lastView && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {timeAgo(lastView)}
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
    </div>
  );
}
