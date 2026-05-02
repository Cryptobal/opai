'use client';

/**
 * SimulationBanner — Banner persistente que se muestra cuando
 * el admin/propietario está simulando otro rol.
 */

import { Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoleSimulation } from '@/contexts/RoleSimulationContext';

export function SimulationBanner() {
    const { isSimulating, simulatedRole, stopSimulation, getRoleLabel } = useRoleSimulation();

    if (!isSimulating || !simulatedRole) return null;

    return (
        <div
            className={cn(
                'sticky top-0 z-[45] flex items-center justify-center gap-3 px-4 py-1.5',
                'bg-status-warn text-white text-xs font-medium backdrop-blur-sm',
                'border-b border-status-warn-border',
                'animate-in slide-in-from-top-2 duration-300',
            )}
        >
            <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 opacity-80" />
                <span>
                    Simulando rol:{' '}
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold',
                            'bg-white/15 border border-white/20',
                        )}
                    >
                        {getRoleLabel(simulatedRole)}
                    </span>
                </span>
                <span className="hidden sm:inline opacity-70">— No es tu sesión real</span>
            </div>
            <button
                type="button"
                onClick={stopSimulation}
                className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all',
                    'bg-white/10 hover:bg-white/20 border border-white/20',
                )}
            >
                <X className="h-3 w-3" />
                <span className="hidden sm:inline">Salir</span>
            </button>
        </div>
    );
}
