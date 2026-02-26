import Link from 'next/link';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export interface ModuleCardProps {
  /** Título del módulo */
  title: string;
  /** Descripción breve */
  description?: string;
  /** Icono de Lucide */
  icon: LucideIcon;
  /** Ruta de navegación */
  href: string;
  /** Contador numérico destacado */
  count?: number | string;
  /** Badge de texto (ej. "Nuevo", "Beta") */
  badge?: string;
  /** Variante de color del icono */
  variant?: 'default' | 'primary';
  className?: string;
}

/**
 * ModuleCard - Card de navegación a módulos
 *
 * Reemplaza las implementaciones repetidas en dashboards de Ops,
 * Finanzas, Payroll e Inventario.
 *
 * @example
 * ```tsx
 * <ModuleCard
 *   title="Inventario"
 *   description="Gestión de productos y stock"
 *   icon={Package}
 *   href="/inventario"
 *   count={234}
 *   variant="primary"
 * />
 * ```
 */
export function ModuleCard({
  title,
  description,
  icon: Icon,
  href,
  count,
  badge,
  variant = 'default',
  className,
}: ModuleCardProps) {
  return (
    <Link href={href} className={cn('block hover:shadow-md transition-shadow rounded-lg', className)}>
      <Card>
        <CardContent className="pt-5 pb-4 px-5">
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
              variant === 'primary'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          {count != null && (
            <div className="text-2xl font-bold text-foreground mt-2">{count}</div>
          )}
          {badge && (
            <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {badge}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
