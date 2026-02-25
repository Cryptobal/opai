'use client';

import { type ComponentType, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Search, FileText, Building2, Calculator, Settings, Plus, UserPlus, Grid3x3, ClipboardList } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { hasAppAccess } from '@/lib/app-access';
import {
  hasAnyConfigSubmoduleAccess,
  hasConfigSubmoduleAccess,
  hasCrmSubmoduleAccess,
  hasDocsSubmoduleAccess,
} from '@/lib/module-access';

type PaletteItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  keywords: string;
  canShow: (role: string) => boolean;
};

const pages: PaletteItem[] = [
  {
    title: 'Inicio',
    href: '/hub',
    icon: Grid3x3,
    keywords: 'home dashboard',
    canShow: (role) => hasAppAccess(role, 'hub'),
  },
  {
    title: 'Documentos',
    href: '/opai/inicio',
    icon: FileText,
    keywords: 'docs presentaciones propuestas',
    canShow: (role) => hasDocsSubmoduleAccess(role, 'overview'),
  },
  {
    title: 'CRM',
    href: '/crm',
    icon: Building2,
    keywords: 'clientes contactos negocios',
    canShow: (role) => hasCrmSubmoduleAccess(role, 'overview'),
  },
  {
    title: 'Payroll',
    href: '/payroll',
    icon: Calculator,
    keywords: 'liquidaciones nomina',
    canShow: (role) => hasAppAccess(role, 'payroll'),
  },
  {
    title: 'Ops',
    href: '/ops',
    icon: ClipboardList,
    keywords: 'operaciones pauta asistencia turnos',
    canShow: (role) => hasAppAccess(role, 'ops'),
  },
  {
    title: 'Configuración',
    href: '/opai/configuracion',
    icon: Settings,
    keywords: 'settings ajustes',
    canShow: (role) => hasAnyConfigSubmoduleAccess(role),
  },
];

const actions: PaletteItem[] = [
  {
    title: 'Nueva Propuesta',
    href: '/opai/templates',
    icon: Plus,
    keywords: 'crear documento presentacion',
    canShow: (role) => hasDocsSubmoduleAccess(role, 'document_editor'),
  },
  {
    title: 'Invitar Usuario',
    href: '/opai/configuracion/usuarios',
    icon: UserPlus,
    keywords: 'equipo colaborador',
    canShow: (role) => hasConfigSubmoduleAccess(role, 'users'),
  },
  {
    title: 'Nueva Cotización',
    href: '/crm/cotizaciones',
    icon: Plus,
    keywords: 'cpq quote presupuesto',
    canShow: (role) => hasCrmSubmoduleAccess(role, 'quotes'),
  },
  {
    title: 'Ir a Pauta Diaria',
    href: '/ops/pauta-diaria',
    icon: Plus,
    keywords: 'asistencia diaria reemplazo ppc',
    canShow: (role) => hasAppAccess(role, 'ops'),
  },
];

interface CommandPaletteProps {
  userRole?: string;
}

export function CommandPalette({ userRole }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const visiblePages = userRole ? pages.filter((page) => page.canShow(userRole)) : [];
  const visibleActions = userRole ? actions.filter((action) => action.canShow(userRole)) : [];

  // Cmd+K is now handled by GlobalSearch in the topbar.
  // The palette can still be opened programmatically if needed.

  const runCommand = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-[540px]">
        <Command className="rounded-lg border border-border bg-popover text-popover-foreground">
          <div className="flex items-center border-b border-border px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Buscar páginas y acciones..."
              className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados.
            </Command.Empty>
            <Command.Group heading="Páginas" className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
              {visiblePages.map((page) => (
                <Command.Item
                  key={page.href}
                  value={`${page.title} ${page.keywords}`}
                  onSelect={() => runCommand(page.href)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <page.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{page.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Separator className="h-px bg-border my-1" />
            <Command.Group heading="Acciones" className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
              {visibleActions.map((action) => (
                <Command.Item
                  key={action.href}
                  value={`${action.title} ${action.keywords}`}
                  onSelect={() => runCommand(action.href)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <action.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{action.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Presiona{' '}
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium">
              ⌘K
            </kbd>{' '}
            para abrir
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
