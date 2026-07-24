"use client";

/**
 * Accesos rápidos del Hub.
 *
 * Orden canónico: Calendario → Correo → Tareas → Crear.
 *
 * Mobile: cuatro accesos directos (icono + label corto). Con 4 slots en
 * ~375px el ícono es el ancla visual; el label evita ambigüedad (solo
 * iconos pierde claridad en "Tareas"/"Crear"). Crear abre el bottom sheet
 * con las acciones de creación rápida.
 *
 * Desktop: botones inline en el mismo orden; Crear se expande a las
 * acciones individuales del sheet.
 */

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
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Mail,
  MapPin,
  Plus,
  Receipt,
  UserPlus,
  UserRoundCheck,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHubEmails } from '@/components/hub/hub-email-context';
import type { HubQuickActionsProps } from '../_lib/hub-types';

interface QuickAction {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}

export function HubQuickActions({ perms }: HubQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const emails = useHubEmails();
  const unreadCount = emails?.data?.unreadCount ?? 0;

  const hasCalendario = perms.hasAgenda;
  const hasCorreo = perms.hasCorreos;
  const hasTareas = perms.hasTareas;

  const sheetActions: QuickAction[] = [];

  if (perms.hasSupervisionCheckin) {
    sheetActions.push({
      href: '/ops/supervision/nueva-visita',
      label: 'Nueva visita',
      icon: <MapPin className="h-4 w-4" />,
    });
  }
  if (perms.hasPersonas) {
    sheetActions.push({
      href: '/personas/guardias/ingreso-te',
      label: 'Ingresar Guardia TE',
      icon: <UserPlus className="h-4 w-4" />,
    });
  }
  if (perms.hasFinanceRendiciones) {
    sheetActions.push({
      href: '/finanzas/rendiciones/nueva',
      label: 'Nueva rendición',
      icon: <Receipt className="h-4 w-4" />,
    });
  }
  if (perms.canMarkAttendance) {
    sheetActions.push({
      href: '/ops/pauta-diaria',
      label: 'Marcar Asistencia',
      icon: <UserRoundCheck className="h-4 w-4" />,
    });
  }
  if (perms.canManageRefuerzos) {
    sheetActions.push({
      href: '/ops/refuerzos',
      label: 'Turnos Refuerzo',
      icon: <Clock3 className="h-4 w-4" />,
    });
  }

  const productivityCount =
    Number(hasCalendario) + Number(hasCorreo) + Number(hasTareas);
  if (productivityCount === 0 && sheetActions.length === 0) return null;

  // Marcar la primera acción como primary para darle énfasis visual.
  if (sheetActions[0]) sheetActions[0].primary = true;

  const mobileTileCols = productivityCount + Number(sheetActions.length > 0);

  return (
    <>
      {/* Desktop: inline buttons — Calendario → Correo → Tareas → crear… */}
      <div className="hidden lg:flex flex-wrap gap-2">
        {hasCalendario && (
          <Link href="/opai/agenda">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-full hover:shadow-sm"
            >
              <CalendarDays className="h-4 w-4" />
              Calendario
            </Button>
          </Link>
        )}
        {hasCorreo && (
          <Link href="/crm/correos">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-full hover:shadow-sm"
            >
              <Mail className="h-4 w-4" />
              Correo
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-bold leading-none text-primary-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          </Link>
        )}
        {hasTareas && (
          <Link href="/opai/tareas">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-full hover:shadow-sm"
            >
              <ClipboardList className="h-4 w-4" />
              Tareas
            </Button>
          </Link>
        )}
        {sheetActions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-full hover:shadow-sm"
            >
              {action.icon}
              {action.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Mobile: accesos directos como pills compactos y monocromos.
          Un solo acento por pantalla: el badge de no leídos en Correo —
          nada de superficies grandes en verde (diseño aprobado en mockup). */}
      <div className="lg:hidden">
        <div
          className={cn(
            'grid gap-2',
            mobileTileCols >= 4
              ? 'grid-cols-4'
              : mobileTileCols === 3
                ? 'grid-cols-3'
                : mobileTileCols === 2
                  ? 'grid-cols-2'
                  : 'grid-cols-1',
          )}
        >
          {hasCalendario && (
            <Link
              href="/opai/agenda"
              aria-label="Calendario"
              className="flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border/60 bg-muted/30 px-1 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              <CalendarDays className="h-4 w-4 shrink-0 opacity-80" />
              <span className="min-w-0 max-w-full truncate text-[12px] font-semibold leading-none">
                Calendario
              </span>
            </Link>
          )}
          {hasCorreo && (
            <Link
              href="/crm/correos"
              aria-label={
                unreadCount > 0
                  ? `Correo, ${unreadCount} sin leer`
                  : 'Correo'
              }
              className="relative flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border/60 bg-muted/30 px-1 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              <span className="relative">
                <Mail className="h-4 w-4 shrink-0 opacity-80" />
                {unreadCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[12px] font-bold leading-none text-primary-foreground"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </span>
              <span className="min-w-0 max-w-full truncate text-[12px] font-semibold leading-none">
                Correo
              </span>
            </Link>
          )}
          {hasTareas && (
            <Link
              href="/opai/tareas"
              aria-label="Tareas"
              className="flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border/60 bg-muted/30 px-1 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              <ClipboardList className="h-4 w-4 shrink-0 opacity-80" />
              <span className="min-w-0 max-w-full truncate text-[12px] font-semibold leading-none">
                Tareas
              </span>
            </Link>
          )}
          {sheetActions.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Crear (${sheetActions.length} acciones)`}
              className="flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-full border border-border/60 bg-muted/30 px-1 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              <Plus className="h-4 w-4 shrink-0 opacity-80" />
              <span className="min-w-0 max-w-full truncate text-[12px] font-semibold leading-none">
                Crear
              </span>
            </button>
          )}
        </div>

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
                Acciones
              </SheetTitle>
              <SheetDescription className="sr-only">
                Selecciona una acción
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-2 max-h-[65vh] overflow-y-auto sm:grid-cols-2">
              {sheetActions.map((action) => (
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
