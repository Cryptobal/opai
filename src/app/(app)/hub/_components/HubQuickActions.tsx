"use client";

/**
 * Accesos rápidos del Hub (solo desktop).
 *
 * Orden canónico: Calendario → Correo → Tareas → acciones de creación.
 *
 * En móvil no se renderiza: Calendario/Correo/Tareas viven en la isla
 * inferior (superficie Productividad) o en la sección «Mi día» del Hub;
 * duplicarlos arriba restaba espacio vertical sin aportar valor.
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  CalendarDays,
  ClipboardList,
  Clock3,
  Mail,
  MapPin,
  Receipt,
  UserPlus,
  UserRoundCheck,
} from 'lucide-react';
import { useHubEmails } from '@/components/hub/hub-email-context';
import type { HubQuickActionsProps } from '../_lib/hub-types';

interface QuickAction {
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}

export function HubQuickActions({ perms }: HubQuickActionsProps) {
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

  if (sheetActions[0]) sheetActions[0].primary = true;

  return (
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
  );
}
