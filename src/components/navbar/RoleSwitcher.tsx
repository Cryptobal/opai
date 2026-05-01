'use client';

/**
 * RoleSwitcher — Selector de simulación de rol en el topbar.
 * Solo visible para usuarios con rol `owner` o `admin`.
 *
 * Lista dinámica: se hidrata desde GET /api/admin/role-templates?compact=1.
 * Se actualiza automáticamente al crear/editar/eliminar un rol vía evento global.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    useRoleSimulation,
    getRoleColor,
    type SimulableRole,
} from '@/contexts/RoleSimulationContext';
import {
    diffPermissions,
    getDefaultPermissions,
} from '@/lib/permissions';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const SEARCH_THRESHOLD = 7;

export function RoleSwitcher() {
    const {
        realRole,
        isSimulating,
        effectiveRole,
        canSimulate,
        roles,
        rolesLoading,
        startSimulation,
        stopSimulation,
        getRoleLabel,
    } = useRoleSimulation();

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset query al cerrar
    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    // Focus al input cuando hay búsqueda
    useEffect(() => {
        if (open && roles.length > SEARCH_THRESHOLD) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open, roles.length]);

    // Mapa slug → "modificado vs preset"
    const modifiedMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (const r of roles) {
            if (!r.permissions) {
                map.set(r.slug, false);
                continue;
            }
            const preset = getDefaultPermissions(r.slug);
            if (Object.keys(preset.modules).length === 0) {
                map.set(r.slug, false); // rol custom sin preset
                continue;
            }
            map.set(r.slug, diffPermissions(r.permissions, preset).total > 0);
        }
        return map;
    }, [roles]);

    // ── Filtrado y agrupación ──
    const { systemRoles, customRoles, hasResults } = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filter = (r: typeof roles[number]) =>
            !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q);
        const filtered = roles.filter(filter);
        return {
            systemRoles: filtered.filter((r) => r.isSystem),
            customRoles: filtered.filter((r) => !r.isSystem),
            hasResults: filtered.length > 0,
        };
    }, [roles, query]);

    if (!canSimulate) return null;
    if (rolesLoading && roles.length === 0) {
        // Skeleton sutil mientras carga
        return (
            <div className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border border-border/40 bg-muted/30 text-muted-foreground/60 animate-pulse">
                <Eye className="h-3 w-3 opacity-60 shrink-0" />
                <span className="hidden sm:inline">Cargando…</span>
            </div>
        );
    }

    const activeColor = getRoleColor(effectiveRole);
    const activeLabel = getRoleLabel(effectiveRole);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200 border',
                        isSimulating
                            ? 'bg-status-warn-soft text-status-warn-fg border-status-warn-border hover:bg-status-warn-soft ring-1 ring-amber-500/20'
                            : `${activeColor.bg} ${activeColor.text} ${activeColor.border} hover:opacity-80`,
                    )}
                    aria-label="Cambiar rol de simulación"
                    aria-expanded={open}
                    title="Simular rol"
                >
                    <Eye className="h-3 w-3 opacity-70 shrink-0" />
                    <span className="hidden sm:inline whitespace-nowrap min-w-0">{activeLabel}</span>
                    <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform duration-200 shrink-0', open && 'rotate-180')} />
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={6}
                className="w-auto min-w-[260px] max-w-[min(calc(100vw-2rem),360px)] p-0 z-[200]"
                side="bottom"
                avoidCollisions
                collisionPadding={8}
            >
                {/* Header */}
                <div className="px-3 py-2.5 border-b border-border/50 shrink-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        Simular vista de rol
                    </p>
                    {isSimulating && (
                        <p className="text-[10px] text-amber-400/80 mt-0.5">
                            Rol real: {getRoleLabel(realRole)}
                        </p>
                    )}
                </div>

                {/* Search input (solo si hay muchos roles) */}
                {roles.length > SEARCH_THRESHOLD && (
                    <div className="px-2 py-2 border-b border-border/50">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar rol…"
                                className="w-full rounded-md border border-border/50 bg-background pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                        </div>
                    </div>
                )}

                {/* Listas */}
                <div className="max-h-[320px] overflow-y-auto">
                    {!hasResults && (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground/70">
                            Sin resultados
                        </p>
                    )}

                    {systemRoles.length > 0 && (
                        <RoleGroup
                            title="Sistema"
                            roles={systemRoles}
                            realRole={realRole}
                            effectiveRole={effectiveRole}
                            modifiedMap={modifiedMap}
                            onSelect={(slug) => {
                                if (slug === realRole) stopSimulation();
                                else startSimulation(slug);
                                setOpen(false);
                            }}
                        />
                    )}

                    {customRoles.length > 0 && (
                        <RoleGroup
                            title={systemRoles.length > 0 ? 'Personalizados' : undefined}
                            roles={customRoles}
                            realRole={realRole}
                            effectiveRole={effectiveRole}
                            modifiedMap={modifiedMap}
                            onSelect={(slug) => {
                                if (slug === realRole) stopSimulation();
                                else startSimulation(slug);
                                setOpen(false);
                            }}
                        />
                    )}
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
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-status-warn-fg transition-colors hover:bg-status-warn-soft"
                        >
                            <EyeOff className="h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-nowrap">Volver a mi rol real</span>
                        </button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

interface RoleGroupProps {
    title?: string;
    roles: SimulableRole[];
    realRole: string;
    effectiveRole: string;
    modifiedMap: Map<string, boolean>;
    onSelect: (slug: string) => void;
}

function RoleGroup({ title, roles, realRole, effectiveRole, modifiedMap, onSelect }: RoleGroupProps) {
    return (
        <div className="py-1">
            {title && (
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    {title}
                </p>
            )}
            {roles.map((role) => {
                const isActive = effectiveRole === role.slug;
                const isRealRole = realRole === role.slug;
                const color = getRoleColor(role.slug);
                const isModified = modifiedMap.get(role.slug) === true;

                return (
                    <button
                        key={role.id}
                        type="button"
                        onClick={() => onSelect(role.slug)}
                        className={cn(
                            'flex w-full items-center gap-2 px-3 text-sm transition-colors',
                            'py-2 min-h-[40px]',
                            isActive
                                ? 'bg-accent/50 text-foreground'
                                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                        )}
                        title={isModified ? 'Permisos modificados respecto al preset' : undefined}
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
                            {role.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 text-left text-sm whitespace-nowrap min-w-0 truncate">
                            {role.name}
                            {isRealRole && (
                                <span className="ml-1 text-[10px] text-muted-foreground/60 font-normal">(tu rol)</span>
                            )}
                        </span>
                        {isModified && (
                            <Sparkles
                                className="h-3 w-3 text-amber-400/80 shrink-0"
                                aria-label="modificado"
                            />
                        )}
                        {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                );
            })}
        </div>
    );
}
