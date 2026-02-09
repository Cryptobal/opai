'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumb - Navegación contextual
 * 
 * Muestra la ruta actual con separadores chevron.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-xs', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
          </div>
        );
      })}
    </nav>
  );
}
