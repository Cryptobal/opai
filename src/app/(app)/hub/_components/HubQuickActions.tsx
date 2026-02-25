import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  BriefcaseBusiness,
  Plus,
  Send,
  UserPlus,
  UserRoundCheck,
  Clock3,
} from 'lucide-react';
import type { HubQuickActionsProps } from '../_lib/hub-types';

export function HubQuickActions({ perms }: HubQuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {perms.canOpenLeads && (
        <Link href="/crm/leads">
          <Button size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <UserPlus className="h-4 w-4" />
            Nuevo Lead
          </Button>
        </Link>
      )}
      {perms.canMarkAttendance && (
        <Link href="/ops/pauta-diaria">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <UserRoundCheck className="h-4 w-4" />
            Marcar Asistencia
          </Button>
        </Link>
      )}
      {perms.canApproveTE && (
        <Link href="/ops/turnos-extra">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <Clock3 className="h-4 w-4" />
            Aprobar TE
          </Button>
        </Link>
      )}
      {perms.canManageRefuerzos && (
        <Link href="/ops/refuerzos">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <Clock3 className="h-4 w-4" />
            Turnos Refuerzo
          </Button>
        </Link>
      )}
      {perms.canOpenDeals && (
        <Link href="/crm/deals">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <BriefcaseBusiness className="h-4 w-4" />
            Ver Pipeline
          </Button>
        </Link>
      )}
      {perms.canOpenQuotes && (
        <Link href="/crm/cotizaciones">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <Send className="h-4 w-4" />
            Cotizaciones
          </Button>
        </Link>
      )}
      {perms.canCreateProposal && (
        <Link href="/opai/templates">
          <Button variant="outline" size="sm" className="gap-2 rounded-full hover:shadow-sm">
            <Plus className="h-4 w-4" />
            Nueva Propuesta
          </Button>
        </Link>
      )}
    </div>
  );
}
