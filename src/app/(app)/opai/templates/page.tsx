/**
 * Gestión de Templates de Presentación
 * 
 * Lista todos los templates disponibles con preview y estadísticas.
 */

import { DocumentosSubnav } from '@/components/opai';
import { PageHeader } from '@/components/opai-ds';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Eye, Calendar } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { resolvePagePerms, canView } from '@/lib/permissions-server';

export default async function TemplatesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/opai/login?callbackUrl=/opai/templates');
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, 'docs', 'presentaciones')) {
    redirect('/opai/inicio');
  }

  const templates = [
    {
      id: 'commercial',
      name: 'Presentación Comercial',
      description: 'Template principal para propuestas comerciales completas',
      slug: 'commercial',
      previewUrl: '/templates/commercial/preview?admin=true',
      usageCount: 45,
      lastEdited: '2026-02-06',
    },
    {
      id: 'email',
      name: 'Template Email',
      description: 'Template para emails de presentación',
      slug: 'email',
      previewUrl: '/templates/email/preview',
      usageCount: 23,
      lastEdited: '2026-02-01',
    },
    {
      id: 'pricing',
      name: 'Formato de Pricing',
      description: 'Template específico para propuestas de pricing',
      slug: 'pricing-format',
      previewUrl: '/templates/pricing-format',
      usageCount: 12,
      lastEdited: '2026-01-28',
    },
  ];

  return (
    <>
      <PageHeader
        title="Templates de Presentación"
        description="Gestiona los templates disponibles para crear presentaciones"
        className="mb-2"
      />

      <DocumentosSubnav />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                </div>
              </div>
              <CardDescription>{template.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  <span>{template.usageCount} usos</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-white" />
                  <span>{template.lastEdited}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Link href={template.previewUrl} target="_blank" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Ver Preview
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info */}
      <Card className="mt-8 border-muted">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            💡 <strong>¿Necesitas un template nuevo?</strong> Los templates se crean mediante código
            para máximo control y calidad. Cada template es un componente React personalizado.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
