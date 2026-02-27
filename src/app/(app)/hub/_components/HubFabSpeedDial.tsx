'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FabAction {
  label: string;
  color: string;
  href: string;
}

interface FabGroup {
  name: string;
  actions: FabAction[];
}

const FAB_GROUPS: FabGroup[] = [
  {
    name: 'Comercial',
    actions: [
      { label: 'Nuevo Lead', color: '#10b981', href: '/crm/leads' },
      { label: 'Nueva Propuesta', color: '#8b5cf6', href: '/opai/templates' },
      { label: 'Cotizaciones', color: '#a78bfa', href: '/crm/cotizaciones' },
    ],
  },
  {
    name: 'Operaciones',
    actions: [
      { label: 'Pauta Diaria', color: '#60a5fa', href: '/ops/pauta-diaria' },
      { label: 'Pauta Mensual', color: '#3b82f6', href: '/ops/pauta-mensual' },
      { label: 'Aprobar TE', color: '#14b8a6', href: '/ops/turnos-extra' },
    ],
  },
  {
    name: 'Personas e Instalaciones',
    actions: [
      { label: 'Personas', color: '#06b6d4', href: '/personas/guardias' },
      { label: 'Instalaciones', color: '#0ea5e9', href: '/crm/installations' },
    ],
  },
  {
    name: 'Finanzas',
    actions: [
      { label: 'Ingresar Rendicion', color: '#f97316', href: '/finanzas/rendiciones/nueva' },
      { label: 'Facturar Refuerzos', color: '#fb923c', href: '/ops/refuerzos?facturar=true' },
    ],
  },
  {
    name: 'Soporte',
    actions: [
      { label: 'Ingresar Ticket', color: '#ec4899', href: '/ops/tickets' },
    ],
  },
];

export function HubFabSpeedDial() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleClose = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  const handleAction = useCallback((href: string) => {
    setIsOpen(false);
    router.push(href);
  }, [router]);

  // Flatten all actions for stagger index
  const allItems: Array<{ type: 'group'; name: string } | { type: 'action'; action: FabAction; href: string }> = [];
  for (const group of FAB_GROUPS) {
    allItems.push({ type: 'group', name: group.name });
    for (const action of group.actions) {
      allItems.push({ type: 'action', action, href: action.href });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      {/* Speed dial items */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed bottom-20 right-4 z-[61] flex flex-col items-end gap-1.5 pb-2">
            {allItems.map((item, idx) => {
              if (item.type === 'group') {
                return (
                  <motion.div
                    key={`group-${item.name}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: idx * 0.035, duration: 0.2 }}
                    className="pr-1 mt-2 first:mt-0"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                      {item.name}
                    </span>
                  </motion.div>
                );
              }

              return (
                <motion.button
                  key={item.action.label}
                  initial={{ opacity: 0, x: 20, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.8 }}
                  transition={{ delay: idx * 0.035, duration: 0.2 }}
                  onClick={() => handleAction(item.href)}
                  className="flex items-center gap-3"
                >
                  <span className="rounded-lg bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg border border-border/50 whitespace-nowrap">
                    {item.action.label}
                  </span>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-lg text-white text-sm font-bold"
                    style={{ backgroundColor: item.action.color }}
                  >
                    {item.action.label.charAt(0)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-20 right-4 z-[62] flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 active:scale-95"
        style={{ backgroundColor: isOpen ? '#ef4444' : '#10b981' }}
        aria-label={isOpen ? 'Cerrar acciones rapidas' : 'Acciones rapidas'}
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {isOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Plus className="h-6 w-6 text-white" />
          )}
        </motion.div>
      </button>
    </>
  );
}
