"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  ChevronRight,
  Clock3,
  MapPin,
  Receipt,
  UserPlus,
  UserRoundCheck,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HubQuickActionsProps } from '../_lib/hub-types';

interface QuickAction {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}

export function HubQuickActions({ perms }: HubQuickActionsProps) {
  const [open, setOpen] = useState(false);

  const actions: QuickAction[] = [];

  if (perms.hasSupervisionCheckin) {
    actions.push({
      href: '/ops/supervision/nueva-visita',
      label: 'Nueva visita',
      icon: <MapPin className="h-4 w-4" />,
    });
  }
  if (perms.hasPersonas) {
    actions.push({
      href: '/personas/guardias/ingreso-te',
      label: 'Ingresar Guardia TE',
      icon: <UserPlus className="h-4 w-4" />,
    });
  }
  if (perms.hasFinanceRendiciones) {
    actions.push({
      href: '/finanzas/rendiciones/nueva',
      label: 'Nueva rendición',
      icon: <Receipt className="h-4 w-4" />,
    });
  }
  if (perms.canMarkAttendance) {
    actions.push({
      href: '/ops/pauta-diaria',
      label: 'Marcar Asistencia',
      icon: <UserRoundCheck className="h-4 w-4" />,
    });
  }
  if (perms.canManageRefuerzos) {
    actions.push({
      href: '/ops/refuerzos',
      label: 'Turnos Refuerzo',
      icon: <Clock3 className="h-4 w-4" />,
    });
  }

  if (actions.length === 0) return null;

  // Marcar la primera acción como primary para darle énfasis visual.
  if (actions[0]) actions[0].primary = true;

  return (
    <>
      {/* Desktop: inline buttons */}
      <div className="hidden lg:flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Button
              size="sm"
              variant={action.primary ? 'default' : 'outline'}
              className="gap-2 rounded-full hover:shadow-sm"
            >
              {action.icon}
              {action.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Mobile: prominent trigger + bottom sheet */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'group relative flex h-11 w-full items-center justify-between gap-2 overflow-hidden rounded-full',
            'border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5',
            'px-4 text-sm font-semibold text-primary shadow-sm',
            'transition-all active:scale-[0.99] hover:border-primary/50 hover:shadow-md',
          )}
          aria-label={`Abrir acciones rápidas (${actions.length})`}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-sm',
              )}
            >
              <Zap className="h-3.5 w-3.5" />
            </span>
            <span className="tracking-tight">Acciones rápidas</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full',
                'bg-primary px-1.5 text-xs font-bold text-primary-foreground',
              )}
            >
              {actions.length}
            </span>
            <ChevronRight className="h-4 w-4 text-primary/70 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl border-t pb-[env(safe-area-inset-bottom,1rem)]"
          >
            <span
              aria-hidden="true"
              className="mx-auto -mt-2 mb-3 block h-1.5 w-10 rounded-full bg-muted-foreground/30"
            />
            <SheetHeader className="pb-3 text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" />
                Acciones rápidas
              </SheetTitle>
              <SheetDescription className="sr-only">
                Selecciona una acción
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-2 max-h-[65vh] overflow-y-auto sm:grid-cols-2">
              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={() => setOpen(false)}
                  className="min-w-0"
                >
                  <div
                    className={cn(
                      'flex h-14 w-full items-center gap-3 rounded-2xl border px-3 transition-colors',
                      action.primary
                        ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                        : 'border-border/60 bg-muted/30 text-foreground hover:border-border hover:bg-muted/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        action.primary
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-foreground border border-border/60',
                      )}
                    >
                      {action.icon}
                    </span>
                    <span className="flex-1 min-w-0 truncate text-left text-sm font-semibold">
                      {action.label}
                    </span>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0',
                        action.primary ? 'text-primary/70' : 'text-muted-foreground',
                      )}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
