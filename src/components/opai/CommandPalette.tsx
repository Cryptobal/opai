'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Search, FileText, Building2, Calculator, Settings, Plus, UserPlus, Grid3x3 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const pages = [
  { title: 'Inicio', href: '/hub', icon: Grid3x3, keywords: 'home dashboard' },
  { title: 'Documentos', href: '/opai/inicio', icon: FileText, keywords: 'docs presentaciones propuestas' },
  { title: 'CRM', href: '/crm', icon: Building2, keywords: 'clientes contactos negocios' },
  { title: 'Payroll', href: '/payroll', icon: Calculator, keywords: 'liquidaciones nomina' },
  { title: 'Configuración', href: '/opai/configuracion/integraciones', icon: Settings, keywords: 'settings ajustes' },
];

const actions = [
  { title: 'Nueva Propuesta', href: '/opai/templates', icon: Plus, keywords: 'crear documento presentacion' },
  { title: 'Invitar Usuario', href: '/opai/configuracion/usuarios', icon: UserPlus, keywords: 'equipo colaborador' },
  { title: 'Nueva Cotización', href: '/crm/cotizaciones', icon: Plus, keywords: 'cpq quote presupuesto' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

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
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados.
            </Command.Empty>
            <Command.Group heading="Páginas" className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 py-1.5">
              {pages.map((page) => (
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
              {actions.map((action) => (
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
