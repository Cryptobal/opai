/**
 * CPQ - Configure, Price, Quote
 * 
 * Módulo de configuración de productos y cotización (próximamente).
 * Incluirá catálogo de productos, reglas de pricing y generación de cotizaciones.
 */

import { PageHeader } from '@/components/opai';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { DollarSign, Package, Settings, FileText, Calculator, Percent } from 'lucide-react';

export default function CPQPage() {
  return (
    <>
      <PageHeader
        title="CPQ"
        description="Configure, Price, Quote"
        className="mb-6"
      />

      {/* Empty State Premium */}
      <div className="flex min-h-[600px] items-center justify-center">
        <Card className="max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-500/10">
              <DollarSign className="h-8 w-8 text-purple-500" />
            </div>
            <Badge variant="outline" className="mx-auto mb-4 w-fit">
              Próximamente
            </Badge>
            <CardTitle className="text-2xl">CPQ OPAI</CardTitle>
            <CardDescription className="text-base">
              Configurador inteligente de productos y cotizaciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Features Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                  <Package className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">Catálogo de Productos</p>
                  <p className="text-sm text-muted-foreground">
                    Gestión centralizada de servicios y SKUs
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                  <Calculator className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium">Reglas de Pricing</p>
                  <p className="text-sm text-muted-foreground">
                    Lógica de precios dinámica y descuentos
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                  <Settings className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="font-medium">Configurador Visual</p>
                  <p className="text-sm text-muted-foreground">
                    Builder interactivo de propuestas
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                  <FileText className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="font-medium">Generación de Quotes</p>
                  <p className="text-sm text-muted-foreground">
                    Cotizaciones profesionales automáticas
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
                  Configurador visual de productos y servicios
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Motor de pricing con reglas de descuento
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  Aprobación de cotizaciones multi-nivel
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                  Integración con ERP y sistemas de facturación
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
