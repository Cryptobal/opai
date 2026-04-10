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
  BriefcaseBusiness,
  Plus,
  Send,
  UserPlus,
  UserRoundCheck,
  Clock3,
  MapPin,
  Receipt,
  Zap,
} from 'lucide-react';
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

  if (perms.canOpenLeads) {
    actions.push({
      href: '/crm/leads',
      label: 'Nuevo Lead',
      icon: <UserPlus className="h-4 w-4" />,
      primary: true,
    });
  }
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
  if (perms.canApproveTE) {
    actions.push({
      href: '/ops/turnos-extra',
      label: 'Aprobar TE',
      icon: <Clock3 className="h-4 w-4" />,
    });
  }
  if (perms.canManageRefuerzos) {
    actions.push({
      href: '/ops/refuerzos',
      label: 'Turnos Refuerzo',
      icon: <Clock3 className="h-4 w-4" />,
    });
  }
  if (perms.canOpenDeals) {
    actions.push({
      href: '/crm/deals',
      label: 'Ver Pipeline',
      icon: <BriefcaseBusiness className="h-4 w-4" />,
    });
  }
  if (perms.canOpenQuotes) {
    actions.push({
      href: '/crm/cotizaciones',
      label: 'Cotizaciones',
      icon: <Send className="h-4 w-4" />,
    });
  }
  if (perms.canCreateProposal) {
    actions.push({
      href: '/opai/templates',
      label: 'Nueva Propuesta',
      icon: <Plus className="h-4 w-4" />,
    });
  }

  if (actions.length === 0) return null;

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

      {/* Mobile: compact trigger + bottom sheet */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-full"
          onClick={() => setOpen(true)}
        >
          <Zap className="h-4 w-4" />
          Acciones rápidas
          <span className="ml-0.5 text-xs text-muted-foreground">{actions.length}</span>
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader className="pb-3">
              <SheetTitle className="text-base">Acciones rápidas</SheetTitle>
              <SheetDescription className="sr-only">
                Selecciona una acción
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
              {actions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  onClick={() => setOpen(false)}
                >
                  <Button
                    variant={action.primary ? 'default' : 'outline'}
                    className="w-full justify-start gap-2.5 h-12 text-sm"
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
