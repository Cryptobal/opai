'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface TenantModulesContextType {
  enabledModules: Set<string>;
  isModuleEnabled: (module: string) => boolean;
  /** Feature flags finos del tenant (TenantModule.config JSONB), ej. cashflowPlanillaV3. */
  featureFlags: Set<string>;
  hasFeatureFlag: (flag: string) => boolean;
  loading: boolean;
}

const TenantModulesContext = createContext<TenantModulesContextType>({
  enabledModules: new Set(),
  isModuleEnabled: () => true, // Default permissive while loading
  featureFlags: new Set(),
  hasFeatureFlag: () => false, // Flags son opt-in: default off
  loading: true,
});

export function TenantModulesProvider({
  children,
  initialModules,
  initialFlags,
}: {
  children: ReactNode;
  initialModules?: string[];
  initialFlags?: string[];
}) {
  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    new Set(initialModules || [])
  );
  const [featureFlags] = useState<Set<string>>(new Set(initialFlags || []));
  const [loading, setLoading] = useState(!initialModules);

  useEffect(() => {
    if (initialModules) return;

    fetch('/api/tenant/modules')
      .then(r => r.json())
      .then(data => {
        setEnabledModules(new Set(data.modules || []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [initialModules]);

  const isModuleEnabled = (module: string) => enabledModules.has(module);
  const hasFeatureFlag = (flag: string) => featureFlags.has(flag);

  return (
    <TenantModulesContext.Provider
      value={{ enabledModules, isModuleEnabled, featureFlags, hasFeatureFlag, loading }}
    >
      {children}
    </TenantModulesContext.Provider>
  );
}

export function useTenantModules() {
  return useContext(TenantModulesContext);
}
