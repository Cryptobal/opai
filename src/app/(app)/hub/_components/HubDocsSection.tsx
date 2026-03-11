// @deprecated — Replaced by HubCrmSection (Hub de Cierre redesign). Safe to delete after validation.
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, FileText, Send, TrendingUp } from 'lucide-react';
import { HubKpiLinkCard } from './HubKpiLinkCard';
import type { HubDocsSectionProps } from '../_lib/hub-types';

/**
 * Standalone docs section — shown when user has docs access but NO CRM access.
 * When user has CRM, docs engagement is shown inline inside HubCrmSection.
 */
export function HubDocsSection({ docsSignals }: HubDocsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <HubKpiLinkCard
          href="/opai/inicio"
          title="Propuestas enviadas"
          value={docsSignals.sent30}
          icon={<Send className="h-4 w-4" />}
          description="Últimos 30 días"
          variant="blue"
        />
        <HubKpiLinkCard
          href="/opai/inicio"
          title="Propuestas abiertas"
          value={docsSignals.viewed30}
          icon={<FileText className="h-4 w-4" />}
          description={`${docsSignals.viewRate30}% de apertura`}
          variant="emerald"
        />
        <HubKpiLinkCard
          href="/opai/inicio"
          title="Sin abrir"
          value={docsSignals.unread30}
          icon={<AlertTriangle className="h-4 w-4" />}
          trend={docsSignals.unread30 > 0 ? 'down' : 'up'}
          trendValue="Requiere seguimiento"
          variant={docsSignals.unread30 > 0 ? 'amber' : 'teal'}
        />
        <HubKpiLinkCard
          href="/opai/inicio"
          title="Tasa de apertura"
          value={`${docsSignals.viewRate30}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          variant="indigo"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inicio comercial</CardTitle>
          <CardDescription>
            Tu rol no tiene acceso al detalle CRM. Mantienes visibilidad de
            envíos y aperturas de propuestas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/opai/inicio"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ir a Documentos Comerciales
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
