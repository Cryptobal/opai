'use client';

/**
 * RoleSimulationContext — Permite a propietarios y administradores
 * simular temporalmente cualquier otro rol del sistema.
 *
 * - Solo visual/frontend, nunca afecta datos reales ni tokens.
 * - Se guarda en sessionStorage (se limpia al cerrar el browser).
 * - Al cerrar sesión se limpia siempre.
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
    type RolePermissions,
} from '@/lib/permissions';

// ── Roles del sistema ──

export const SYSTEM_ROLES = [
    { slug: 'owner', label: 'Propietario' },
    { slug: 'admin', label: 'Administrador' },
    { slug: 'editor', label: 'Gerente' },
    { slug: 'jefe_operaciones', label: 'Jefatura' },
    { slug: 'central_monitoreo', label: 'Central Monitoreo' },
    { slug: 'supervisor', label: 'Supervisor' },
    { slug: 'viewer', label: 'Viewer' },
] as const;

/** Roles que pueden usar el Role Switcher */
const ALLOWED_REAL_ROLES = ['owner', 'admin'];

const SESSION_KEY = 'opai_simulated_role';

// ── Color helpers para badges ──

export const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    owner: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    admin: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
    editor: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    jefe_operaciones: { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
    central_monitoreo: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    supervisor: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
    viewer: { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export function getRoleColor(role: string) {
    return ROLE_COLORS[role] ?? { bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30' };
}

export function getRoleLabel(role: string) {
    return SYSTEM_ROLES.find((r) => r.slug === role)?.label ?? role;
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
    /** Inicia la simulación de un rol */
    startSimulation: (role: string) => void;
    /** Detiene la simulación y vuelve al rol real */
    stopSimulation: () => void;
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

    // Rehidratar desde sessionStorage
    useEffect(() => {
        if (!canSimulate) return;
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored && SYSTEM_ROLES.some((r) => r.slug === stored)) {
                setSimulatedRole(stored);
            }
        } catch {
            // SSR o sessionStorage no disponible
        }
    }, [canSimulate]);

    const startSimulation = useCallback(
        (role: string) => {
            if (!canSimulate) return;
            setSimulatedRole(role);
            try {
                sessionStorage.setItem(SESSION_KEY, role);
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

    const effectivePermissions = useMemo(() => {
        if (!isSimulating) return realPermissions;
        return getDefaultPermissions(simulatedRole!);
    }, [isSimulating, simulatedRole, realPermissions]);

    const value = useMemo<RoleSimulationContextType>(
        () => ({
            realRole,
            simulatedRole: isSimulating ? simulatedRole : null,
            isSimulating,
            effectiveRole,
            effectivePermissions,
            canSimulate,
            startSimulation,
            stopSimulation,
        }),
        [realRole, simulatedRole, isSimulating, effectiveRole, effectivePermissions, canSimulate, startSimulation, stopSimulation],
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
