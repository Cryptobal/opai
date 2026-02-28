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
  /** En mobile: layout compacto (icono+título, sin descripción) para ver más módulos sin scroll */
  compactOnMobile?: boolean;
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
  compactOnMobile = false,
  className,
}: ModuleCardProps) {
  return (
    <Link href={href} className={cn('block hover:shadow-md transition-shadow rounded-lg', className)}>
      <Card>
        <CardContent
          className={cn(
            'pt-5 px-5',
            compactOnMobile && 'sm:pt-5 sm:px-5 pt-3 px-3'
          )}
        >
          <div
            className={cn(
              'rounded-lg flex items-center justify-center',
              variant === 'primary'
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
              compactOnMobile ? 'w-9 h-9 sm:w-10 sm:h-10 mb-2 sm:mb-3' : 'w-10 h-10 mb-3'
            )}
          >
            <Icon className={cn(compactOnMobile ? 'h-4 w-4 sm:h-5 sm:w-5' : 'h-5 w-5')} />
          </div>
          <div className={cn(
            'font-semibold text-foreground',
            compactOnMobile ? 'text-xs sm:text-sm' : 'text-sm'
          )}>
            {title}
          </div>
          {description && (
            <p
              className={cn(
                'text-xs text-muted-foreground mt-1',
                compactOnMobile && 'hidden sm:block'
              )}
            >
              {description}
            </p>
          )}
          {count != null && (
            <div className={cn(
              'font-bold text-foreground mt-2',
              compactOnMobile ? 'text-lg sm:text-2xl' : 'text-2xl'
            )}>
              {count}
            </div>
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
