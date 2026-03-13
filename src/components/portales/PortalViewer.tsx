'use client';

/**
 * PortalViewer — Drawer/panel lateral (75% width) con iframe del portal.
 *
 * - Se abre desde la derecha como un drawer.
 * - Incluye header con controles (cerrar, abrir en nueva pestaña).
 * - El iframe apunta a la ruta interna del portal (mismo dominio).
 */

import { useEffect, useRef } from 'react';
import { ExternalLink, Maximize2, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PortalViewerProps {
    name: string;
    href: string;
    icon: LucideIcon;
    isOpen: boolean;
    onClose: () => void;
}

export function PortalViewer({ name, href, icon: Icon, isOpen, onClose }: PortalViewerProps) {
    const backdropRef = useRef<HTMLDivElement>(null);

    // Bloquear scroll del body cuando está abierto
    useEffect(() => {
        if (!isOpen) return;
        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);

    // Cerrar con Escape
    useEffect(() => {
        if (!isOpen) return;
        function handleEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100]">
            {/* Backdrop */}
            <div
                ref={backdropRef}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel (drawer de derecha a izquierda, 75% ancho) */}
            <div
                className={cn(
                    'absolute right-0 top-0 h-full flex flex-col',
                    'w-full sm:w-[85%] lg:w-[75%]',
                    'bg-background border-l border-border shadow-2xl',
                    'animate-in slide-in-from-right duration-300',
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between h-12 px-4 border-b border-border/60 bg-card shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-sm font-semibold text-foreground">{name}</h2>
                        <span className="text-[10px] text-muted-foreground/70 rounded bg-muted px-1.5 py-0.5">
                            Vista embebida
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-md',
                                'text-muted-foreground transition-colors',
                                'hover:bg-accent hover:text-foreground',
                            )}
                            title="Abrir en nueva pestaña"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </a>
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-md',
                                'text-muted-foreground transition-colors',
                                'hover:bg-accent hover:text-foreground',
                            )}
                            title="Pantalla completa"
                        >
                            <Maximize2 className="h-4 w-4" />
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-md',
                                'text-muted-foreground transition-colors',
                                'hover:bg-destructive/10 hover:text-destructive',
                            )}
                            aria-label="Cerrar portal"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* iframe */}
                <div className="flex-1 bg-background">
                    <iframe
                        src={href}
                        title={`Portal: ${name}`}
                        className="h-full w-full border-0"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
                    />
                </div>
            </div>
        </div>
    );
}
