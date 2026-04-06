'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface TenantModulesContextType {
  enabledModules: Set<string>;
  isModuleEnabled: (module: string) => boolean;
  loading: boolean;
}

const TenantModulesContext = createContext<TenantModulesContextType>({
  enabledModules: new Set(),
  isModuleEnabled: () => true, // Default permissive while loading
  loading: true,
});

export function TenantModulesProvider({
  children,
  initialModules,
}: {
  children: ReactNode;
  initialModules?: string[];
}) {
  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    new Set(initialModules || [])
  );
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

  return (
    <TenantModulesContext.Provider value={{ enabledModules, isModuleEnabled, loading }}>
      {children}
    </TenantModulesContext.Provider>
  );
}

export function useTenantModules() {
  return useContext(TenantModulesContext);
}
