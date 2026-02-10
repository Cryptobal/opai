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
import { PageHeader, ReloadButton, DocumentosSubnav } from '@/components/opai';
import { DocumentosContent } from '@/components/opai/DocumentosContent';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

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

  // Resolver negocio CRM (dealId) por presentación usando quoteId -> cpqQuote.dealId
  const quoteIds = Array.from(
    new Set(
      presentations
        .map((p) => p.quoteId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const quotes = quoteIds.length
    ? await prisma.cpqQuote.findMany({
        where: { tenantId, id: { in: quoteIds } },
        select: { id: true, dealId: true },
      })
    : [];
  const dealIdByQuoteId = new Map(quotes.map((q) => [q.id, q.dealId ?? null]));
  const presentationsWithDeals = presentations.map((p) => ({
    ...p,
    crmDealId: p.quoteId ? (dealIdByQuoteId.get(p.quoteId) ?? null) : null,
  }));

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
      {/* Page Header: título, enlace a Templates y Recargar */}
      <PageHeader
        title="Documentos Comerciales"
        description={
          <>
            Gestiona y monitorea tus presentaciones comerciales enviadas
            {' · '}
            <Link href="/opai/templates" className="text-primary hover:underline font-medium">
              Ver templates
            </Link>
          </>
        }
        actions={<ReloadButton />}
        className="mb-2"
      />

      {/* Sub-navegación */}
      <DocumentosSubnav />

      {/* Content con KPIs clickeables */}
      <DocumentosContent
        presentations={presentationsWithDeals}
        stats={stats}
        conversionRate={conversionRate}
      />
    </>
  );
}
