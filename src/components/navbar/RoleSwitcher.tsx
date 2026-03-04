'use client';

/**
 * RoleSwitcher — Selector de simulación de rol en el topbar.
 * Solo visible para usuarios con rol `owner` o `admin`.
 */

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    useRoleSimulation,
    SYSTEM_ROLES,
    getRoleColor,
    getRoleLabel,
} from '@/contexts/RoleSimulationContext';

export function RoleSwitcher() {
    const {
        realRole,
        simulatedRole,
        isSimulating,
        effectiveRole,
        canSimulate,
        startSimulation,
        stopSimulation,
    } = useRoleSimulation();

    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Cerrar dropdown al hacer click afuera
    useEffect(() => {
        if (!open) return;
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    // Cerrar con Escape
    useEffect(() => {
        if (!open) return;
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [open]);

    if (!canSimulate) return null;

    const activeColor = getRoleColor(effectiveRole);
    const activeLabel = getRoleLabel(effectiveRole);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 border',
                    isSimulating
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 ring-1 ring-amber-500/20'
                        : `${activeColor.bg} ${activeColor.text} ${activeColor.border} hover:opacity-80`,
                )}
                aria-label="Cambiar rol de simulación"
                aria-expanded={open}
            >
                <Eye className="h-3 w-3 opacity-70" />
                <span className="hidden sm:inline max-w-[100px] truncate">{activeLabel}</span>
                <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform duration-200', open && 'rotate-180')} />
            </button>

            {/* Dropdown */}
            {open && (
                <div
                    className={cn(
                        'absolute right-0 top-full mt-1.5 z-50 w-60 rounded-lg border border-border bg-popover shadow-xl',
                        'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200',
                    )}
                >
                    {/* Header */}
                    <div className="px-3 py-2.5 border-b border-border/50">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                            Simular vista de rol
                        </p>
                        {isSimulating && (
                            <p className="text-[10px] text-amber-400/80 mt-0.5">
                                Rol real: {getRoleLabel(realRole)}
                            </p>
                        )}
                    </div>

                    {/* Role list */}
                    <div className="max-h-[280px] overflow-y-auto py-1">
                        {SYSTEM_ROLES.map((role) => {
                            const isActive = effectiveRole === role.slug;
                            const isRealRole = realRole === role.slug;
                            const color = getRoleColor(role.slug);

                            return (
                                <button
                                    key={role.slug}
                                    type="button"
                                    onClick={() => {
                                        if (role.slug === realRole) {
                                            stopSimulation();
                                        } else {
                                            startSimulation(role.slug);
                                        }
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                                        isActive
                                            ? 'bg-accent/50 text-foreground'
                                            : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-bold shrink-0',
                                            color.bg,
                                            color.text,
                                            'border',
                                            color.border,
                                        )}
                                    >
                                        {role.label.charAt(0)}
                                    </span>
                                    <span className="flex-1 text-left truncate text-xs">
                                        {role.label}
                                        {isRealRole && (
                                            <span className="ml-1 text-[10px] text-muted-foreground/60">(tu rol)</span>
                                        )}
                                    </span>
                                    {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Exit simulation */}
                    {isSimulating && (
                        <div className="border-t border-border/50 p-1.5">
                            <button
                                type="button"
                                onClick={() => {
                                    stopSimulation();
                                    setOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
                            >
                                <EyeOff className="h-3.5 w-3.5" />
                                Volver a mi rol real
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
