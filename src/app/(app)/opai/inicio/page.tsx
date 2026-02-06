/**
 * Dashboard - Gestión de documentos comerciales
 * 
 * Panel principal para ver y gestionar documentos enviados
 * Protegido por Auth.js; datos filtrados por tenantId de la sesión.
 * 
 * Usa OPAI Design System:
 * - PageHeader para título y acciones (Templates + Notificaciones)
 * - KpiCard para métricas
 * - PresentationsList para tabla
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDefaultTenantId } from '@/lib/tenant';
import { PageHeader, KpiCard, TemplatesDropdown, NotificationBell } from '@/components/opai';
import { PresentationsList } from '@/components/admin/PresentationsList';
import { 
  FileText, 
  Send, 
  Eye, 
  Mail,
  TrendingUp,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/opai/login?callbackUrl=/opai/inicio');
  const tenantId = session.user.tenantId ?? await getDefaultTenantId();

  const presentations = await prisma.presentation.findMany({
    where: { tenantId },
    include: {
      views: { orderBy: { viewedAt: 'desc' } },
      template: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Calcular estadísticas
  const stats = {
    total: presentations.length,
    sent: presentations.filter((p) => p.status === 'sent').length,
    viewed: presentations.filter((p) => p.viewCount > 0).length,
    pending: presentations.filter((p) => p.status === 'sent' && p.viewCount === 0).length,
    opened: presentations.filter((p) => p.openCount > 0).length,
    clicked: presentations.filter((p) => p.clickCount > 0).length,
    totalViews: presentations.reduce((sum, p) => sum + p.viewCount, 0),
    totalOpens: presentations.reduce((sum, p) => sum + p.openCount, 0),
    totalClicks: presentations.reduce((sum, p) => sum + p.clickCount, 0),
  };

  // Calcular tasa de conversión
  const conversionRate = stats.sent > 0 ? (stats.viewed / stats.sent) * 100 : 0;
  const openRate = stats.sent > 0 ? (stats.opened / stats.sent) * 100 : 0;
  const clickRate = stats.opened > 0 ? (stats.clicked / stats.opened) * 100 : 0;

  // Preparar presentations para NotificationBell
  const presentationsForBell = presentations.map(p => ({
    id: p.id,
    uniqueId: p.uniqueId,
    status: p.status,
    viewCount: p.viewCount,
    emailSentAt: p.emailSentAt,
    clientData: p.clientData,
  }));

  return (
    <>
      {/* Page Header con Templates y Notificaciones en la misma línea */}
      <PageHeader
        title="Documentos Comerciales"
        description="Gestiona y monitorea tus presentaciones comerciales enviadas"
        actions={
          <>
            <TemplatesDropdown />
            <NotificationBell presentations={presentationsForBell} />
          </>
        }
        className="mb-4"
      />

      {/* KPI Cards - OPAI Design System (sin description para altura uniforme) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <KpiCard
          title="Total"
          value={stats.total}
          icon={<FileText className="h-4 w-4" />}
        />
        <KpiCard
          title="Enviadas"
          value={stats.sent}
          icon={<Send className="h-4 w-4" />}
          trend={stats.sent > 0 ? 'up' : 'neutral'}
        />
        <KpiCard
          title="Vistas"
          value={stats.viewed}
          icon={<Eye className="h-4 w-4" />}
          trend={stats.viewed > 0 ? 'up' : 'neutral'}
          trendValue={`${stats.totalViews} total`}
        />
        <KpiCard
          title="Sin Leer"
          value={stats.pending}
          icon={<Mail className="h-4 w-4" />}
          trend={stats.pending > 0 ? 'down' : 'up'}
          trendValue={`${stats.sent > 0 ? ((stats.pending / stats.sent) * 100).toFixed(0) : 0}%`}
        />
        <KpiCard
          title="Conversión"
          value={`${conversionRate.toFixed(1)}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          trend={conversionRate > 50 ? 'up' : conversionRate > 25 ? 'neutral' : 'down'}
          trendValue="Vista/Env"
        />
      </div>

      {/* Presentations List */}
      <PresentationsList 
        presentations={presentations}
        initialFilter="all"
      />
    </>
  );
}
