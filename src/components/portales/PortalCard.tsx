'use client';

/**
 * PortalCard — Card de cada portal disponible en la vista /portales.
 */

import Link from 'next/link';
import { BarChart3, ExternalLink, Monitor, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PortalCardProps {
    name: string;
    description: string;
    href: string;
    icon: LucideIcon;
    accentColor?: string;
    portalId?: string;
    onOpen: () => void;
}

export function PortalCard({
    name,
    description,
    href,
    icon: Icon,
    accentColor = 'from-primary/20 to-primary/5',
    portalId,
    onOpen,
}: PortalCardProps) {
    return (
        <div
            className={cn(
                'group relative overflow-hidden rounded-xl border border-border/60',
                'bg-card transition-all duration-300',
                'hover:border-border hover:shadow-lg hover:shadow-primary/5',
            )}
        >
            {/* Gradient accent top */}
            <div className={cn('h-1 w-full bg-gradient-to-r', accentColor)} />

            <div className="p-6">
                {/* Icon + Title */}
                <div className="flex items-start gap-4 mb-4">
                    <div
                        className={cn(
                            'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                            'bg-gradient-to-br',
                            accentColor,
                            'border border-border/40',
                            'transition-transform duration-300 group-hover:scale-105',
                        )}
                    >
                        <Icon className="h-6 w-6 text-foreground/80" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground mb-1">
                            {name}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            {description}
                        </p>
                    </div>
                </div>

                {/* URL info */}
                <div className="mb-5 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    <code className="text-[11px] text-muted-foreground/80 truncate">
                        {href}
                    </code>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onOpen}
                        className={cn(
                            'flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5',
                            'bg-primary text-primary-foreground text-sm font-medium',
                            'transition-all duration-200',
                            'hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
                            'active:scale-[0.98]',
                        )}
                    >
                        <Monitor className="h-4 w-4" />
                        Abrir Portal
                    </button>
                    {portalId && !['marcacion', 'acceso'].includes(portalId) && (
                        <Link
                            href={`/portales/${portalId}/ranking`}
                            className={cn(
                                'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5',
                                'border border-border text-sm font-medium text-muted-foreground',
                                'transition-all duration-200',
                                'hover:bg-accent hover:text-foreground hover:border-border/80',
                                'active:scale-[0.98]',
                            )}
                            title="Ver ranking de uso"
                        >
                            <BarChart3 className="h-4 w-4" />
                            <span className="hidden sm:inline">Ranking</span>
                        </Link>
                    )}
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5',
                            'border border-border text-sm font-medium text-muted-foreground',
                            'transition-all duration-200',
                            'hover:bg-accent hover:text-foreground hover:border-border/80',
                            'active:scale-[0.98]',
                        )}
                        title="Abrir en nueva pestaña"
                    >
                        <ExternalLink className="h-4 w-4" />
                        <span className="hidden sm:inline">Nueva pestaña</span>
                    </a>
                </div>
            </div>
        </div>
    );
}
