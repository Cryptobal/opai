'use client';

/**
 * RoleSimulationContext — Permite a propietarios y administradores
 * simular temporalmente cualquier otro rol del sistema.
 *
 * - Solo visual/frontend, nunca afecta datos reales ni tokens.
 * - Se guarda en sessionStorage (se limpia al cerrar el browser).
 * - Al cerrar sesión se limpia siempre.
 * - Lista de roles + permisos vienen de la BD (no hardcoded).
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    getDefaultPermissions,
    mergeRolePermissions,
    EMPTY_PERMISSIONS,
    type RolePermissions,
} from '@/lib/permissions';

// ── Tipos ──

export interface SimulableRole {
    /** Identificador del template en BD */
    id: string;
    /** Slug interno del rol (ej. "editor", "supervisor", o un slug custom) */
    slug: string;
    /** Nombre visible del rol (proviene del template en BD) */
    name: string;
    /** Si es un rol de sistema (no editable / no eliminable) */
    isSystem: boolean;
    /** Permisos efectivos del rol (mergeo de defaults + overrides BD) */
    permissions: RolePermissions | null;
}

/** Roles reales que pueden usar el RoleSwitcher */
const ALLOWED_REAL_ROLES = ['owner', 'admin'];

const SESSION_KEY = 'opai_simulated_role';

/** Evento global que dispara un refetch de la lista de roles */
export const ROLES_UPDATED_EVENT = 'opai-roles-updated';

// ── Color helpers para badges ──

export const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    owner: { bg: 'bg-status-warn-soft', text: 'text-status-warn-fg', border: 'border-status-warn-border' },
    admin: { bg: 'bg-status-info-soft', text: 'text-status-info-fg', border: 'border-status-info-border' },
    editor: { bg: 'bg-status-ok-soft', text: 'text-status-ok-fg', border: 'border-status-ok-border' },
    jefe_operaciones: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
    central_monitoreo: { bg: 'bg-status-info-soft', text: 'text-status-info-fg', border: 'border-status-info-border' },
    supervisor: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    viewer: { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' },
};

const FALLBACK_COLOR = { bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30' };

/** Pool determinista para roles custom (color se asigna por hash del slug) */
const CUSTOM_COLOR_POOL: Array<{ bg: string; text: string; border: string }> = [
    { bg: 'bg-status-danger-soft', text: 'text-status-danger-fg', border: 'border-status-danger-border' },
    { bg: 'bg-pink-500/15', text: 'text-pink-300', border: 'border-pink-500/30' },
    { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30' },
    { bg: 'bg-status-info-soft', text: 'text-status-info-fg', border: 'border-status-info-border' },
    { bg: 'bg-status-info-soft', text: 'text-status-info-fg', border: 'border-status-info-border' },
    { bg: 'bg-lime-500/15', text: 'text-lime-300', border: 'border-lime-500/30' },
    { bg: 'bg-orange-500/15', text: 'text-status-warn-fg', border: 'border-status-warn-border' },
];

function hashSlug(slug: string): number {
    let h = 0;
    for (let i = 0; i < slug.length; i++) {
        h = (h << 5) - h + slug.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

export function getRoleColor(slug: string): { bg: string; text: string; border: string } {
    if (ROLE_COLORS[slug]) return ROLE_COLORS[slug];
    if (!slug) return FALLBACK_COLOR;
    return CUSTOM_COLOR_POOL[hashSlug(slug) % CUSTOM_COLOR_POOL.length];
}

// ── Context shape ──

interface RoleSimulationContextType {
    /** Rol real del usuario (del JWT/sesión) */
    realRole: string;
    /** Rol actualmente simulado (null si no está simulando) */
    simulatedRole: string | null;
    /** true si está simulando un rol diferente */
    isSimulating: boolean;
    /** Rol efectivo: simulado si está activo, real si no */
    effectiveRole: string;
    /** Permisos efectivos basados en el rol activo */
    effectivePermissions: RolePermissions;
    /** true si el usuario tiene permiso para usar el Role Switcher */
    canSimulate: boolean;
    /** Lista de roles disponibles para simular (cargada desde BD) */
    roles: SimulableRole[];
    /** true mientras se carga la lista por primera vez */
    rolesLoading: boolean;
    /** Devuelve el nombre humano del rol (slug → name) */
    getRoleLabel: (slug: string) => string;
    /** Inicia la simulación de un rol */
    startSimulation: (slug: string) => void;
    /** Detiene la simulación y vuelve al rol real */
    stopSimulation: () => void;
    /** Forzar refetch de la lista (útil tras crear/editar/eliminar un rol) */
    refreshRoles: () => Promise<void>;
}

const RoleSimulationContext = createContext<RoleSimulationContextType | null>(null);

// ── Provider ──

interface RoleSimulationProviderProps {
    children: ReactNode;
    realRole: string;
    realPermissions: RolePermissions;
}

export function RoleSimulationProvider({
    children,
    realRole,
    realPermissions,
}: RoleSimulationProviderProps) {
    const canSimulate = ALLOWED_REAL_ROLES.includes(realRole);

    const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
    const [roles, setRoles] = useState<SimulableRole[]>([]);
    const [rolesLoading, setRolesLoading] = useState(true);

    const refreshRoles = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/role-templates?compact=1', {
                cache: 'no-store',
                credentials: 'include',
            });
            if (!res.ok) {
                setRolesLoading(false);
                return;
            }
            const json = await res.json();
            if (json?.success && Array.isArray(json.data)) {
                setRoles(
                    (json.data as Array<{
                        id: string;
                        slug: string;
                        name: string;
                        isSystem: boolean;
                        permissions: RolePermissions | null;
                    }>).map((r) => ({
                        id: r.id,
                        slug: r.slug,
                        name: r.name,
                        isSystem: !!r.isSystem,
                        permissions: r.permissions ?? null,
                    })),
                );
            }
        } catch {
            // silenciar — el switcher gracefully no aparece sin lista
        } finally {
            setRolesLoading(false);
        }
    }, []);

    // Carga inicial — solo si el usuario puede simular (evita fetch innecesario)
    useEffect(() => {
        if (!canSimulate) {
            setRolesLoading(false);
            return;
        }
        refreshRoles();
    }, [canSimulate, refreshRoles]);

    // Suscripción a evento global (cuando se crea/edita/elimina un rol)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!canSimulate) return;
        const onUpdate = () => {
            refreshRoles();
        };
        window.addEventListener(ROLES_UPDATED_EVENT, onUpdate);
        return () => window.removeEventListener(ROLES_UPDATED_EVENT, onUpdate);
    }, [canSimulate, refreshRoles]);

    // Rehidratar simulación desde sessionStorage cuando ya tengamos roles
    useEffect(() => {
        if (!canSimulate) return;
        if (rolesLoading) return;
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored && roles.some((r) => r.slug === stored)) {
                setSimulatedRole(stored);
            } else if (stored && !roles.some((r) => r.slug === stored)) {
                // El rol ya no existe (fue eliminado): limpiar
                sessionStorage.removeItem(SESSION_KEY);
            }
        } catch {
            // SSR o sessionStorage no disponible
        }
    }, [canSimulate, rolesLoading, roles]);

    const startSimulation = useCallback(
        (slug: string) => {
            if (!canSimulate) return;
            setSimulatedRole(slug);
            try {
                sessionStorage.setItem(SESSION_KEY, slug);
            } catch {
                // sessionStorage no disponible
            }
        },
        [canSimulate],
    );

    const stopSimulation = useCallback(() => {
        setSimulatedRole(null);
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch {
            // sessionStorage no disponible
        }
    }, []);

    const isSimulating = canSimulate && simulatedRole !== null && simulatedRole !== realRole;
    const effectiveRole = isSimulating ? simulatedRole! : realRole;

    const effectivePermissions = useMemo<RolePermissions>(() => {
        if (!isSimulating || !simulatedRole) return realPermissions;

        // 1) Buscar el template en la lista (fuente de verdad: BD)
        const dbRole = roles.find((r) => r.slug === simulatedRole);
        const defaults = getDefaultPermissions(simulatedRole);

        if (dbRole?.permissions) {
            // El servidor ya hizo el merge para owner/admin; para el resto,
            // mergeamos defaults + overrides BD (overrides ganan).
            return mergeRolePermissions(defaults, dbRole.permissions);
        }

        // 2) Sin permiso para ver el cuerpo (no es owner/admin) — usar defaults
        if (defaults && Object.keys(defaults.modules).length > 0) return defaults;

        return EMPTY_PERMISSIONS;
    }, [isSimulating, simulatedRole, realPermissions, roles]);

    const getRoleLabel = useCallback(
        (slug: string) => {
            const dbRole = roles.find((r) => r.slug === slug);
            if (dbRole) return dbRole.name;
            return slug;
        },
        [roles],
    );

    const value = useMemo<RoleSimulationContextType>(
        () => ({
            realRole,
            simulatedRole: isSimulating ? simulatedRole : null,
            isSimulating,
            effectiveRole,
            effectivePermissions,
            canSimulate,
            roles,
            rolesLoading,
            getRoleLabel,
            startSimulation,
            stopSimulation,
            refreshRoles,
        }),
        [realRole, simulatedRole, isSimulating, effectiveRole, effectivePermissions, canSimulate, roles, rolesLoading, getRoleLabel, startSimulation, stopSimulation, refreshRoles],
    );

    return (
        <RoleSimulationContext.Provider value={value}>
            {children}
        </RoleSimulationContext.Provider>
    );
}

// ── Hook ──

export function useRoleSimulation() {
    const ctx = useContext(RoleSimulationContext);
    if (!ctx) {
        throw new Error('useRoleSimulation must be used within a RoleSimulationProvider');
    }
    return ctx;
}

/** Helper imperativo: dispara el evento que notifica que la lista de roles cambió */
export function notifyRolesUpdated() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(ROLES_UPDATED_EVENT));
    }
}
