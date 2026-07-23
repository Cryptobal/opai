"use client";

/**
 * Accesos rápidos del Hub.
 *
 * Mobile: tres accesos directos visibles sin abrir sheets — Calendario
 * (/opai/agenda), Correos (/crm/correos, con badge de no leídos cuando el
 * conteo ya está disponible vía HubEmailProvider) y Crear (abre el bottom
 * sheet existente con las acciones de creación rápida). Las acciones
 * secundarias permanecen dentro del sheet.
 *
 * Desktop: botones inline con "Abrir calendario" como primera acción.
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

  // Calendario/Correos requieren acceso CRM (Agenda y Correos viven ahí).
  const hasAgenda = perms.hasCrm;

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

  if (!hasAgenda && sheetActions.length === 0) return null;

  // Marcar la primera acción como primary para darle énfasis visual.
  if (sheetActions[0]) sheetActions[0].primary = true;

  const mobileTileCols =
    Number(hasAgenda) * 2 + Number(sheetActions.length > 0);

  return (
    <>
      {/* Desktop: inline buttons — calendario primero */}
      <div className="hidden lg:flex flex-wrap gap-2">
        {hasAgenda && (
          <Link href="/opai/agenda">
            <Button size="sm" className="gap-2 rounded-full hover:shadow-sm">
              <CalendarDays className="h-4 w-4" />
              Abrir calendario
            </Button>
          </Link>
        )}
        {hasAgenda && (
          <Link href="/crm/correos">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 rounded-full hover:shadow-sm"
            >
              <Mail className="h-4 w-4" />
              Correos
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-bold leading-none text-primary-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
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

      {/* Mobile: accesos directos visibles (sin pill único que esconda todo) */}
      <div className="lg:hidden">
        <div
          className={cn(
            'grid gap-2',
            mobileTileCols >= 3 ? 'grid-cols-3' : mobileTileCols === 2 ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {hasAgenda && (
            <Link
              href="/opai/agenda"
              className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-primary/40 bg-primary/10 text-primary transition-colors active:scale-[0.98] hover:bg-primary/15"
            >
              <CalendarDays className="h-5 w-5" />
              <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-tight">
                Calendario
              </span>
            </Link>
          )}
          {hasAgenda && (
            <Link
              href="/crm/correos"
              className="relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border/60 bg-muted/30 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              {unreadCount > 0 && (
                <span
                  aria-label={`${unreadCount} correos sin leer`}
                  className="absolute right-2 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-bold leading-none text-primary-foreground"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              <Mail className="h-5 w-5" />
              <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-tight">
                Correos
              </span>
            </Link>
          )}
          {sheetActions.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Crear (${sheetActions.length} acciones)`}
              className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border border-border/60 bg-muted/30 text-foreground transition-colors active:scale-[0.98] hover:bg-muted/50"
            >
              <Plus className="h-5 w-5" />
              <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-tight">
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
