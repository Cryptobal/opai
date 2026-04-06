'use client';

import { useTenantModules } from '@/contexts/TenantModulesContext';
import { ReactNode } from 'react';
import { Lock } from 'lucide-react';

interface ModuleGateProps {
  module: string;
  children: ReactNode;
  moduleName?: string;
}

/**
 * Wrapper que muestra los children solo si el módulo está habilitado.
 * Si no, muestra un mensaje de upgrade.
 */
export function ModuleGate({ module, children, moduleName }: ModuleGateProps) {
  const { isModuleEnabled, loading } = useTenantModules();

  if (loading) return null;

  if (!isModuleEnabled(module)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">
          {moduleName || 'Este módulo'} no está disponible en tu plan
        </h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Contacta a tu administrador para activar este módulo o actualiza tu plan para acceder a esta funcionalidad.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
