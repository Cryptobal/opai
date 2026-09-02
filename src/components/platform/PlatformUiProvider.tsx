"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { PlatformRole } from "@/lib/platform/roles";
import { hasMinPlatformRole } from "@/lib/platform/roles";

interface PlatformUiValue {
  role: PlatformRole;
  adminName: string;
  adminEmail: string;
  createOpen: boolean;
  openCreateTenant: () => void;
  closeCreateTenant: () => void;
  can: (minRole: PlatformRole) => boolean;
}

const PlatformUiContext = createContext<PlatformUiValue | null>(null);

export function PlatformUiProvider({
  role,
  adminName,
  adminEmail,
  children,
}: {
  role: PlatformRole;
  adminName: string;
  adminEmail: string;
  children: ReactNode;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const can = useCallback((minRole: PlatformRole) => hasMinPlatformRole(role, minRole), [role]);
  const value = useMemo(
    () => ({
      role,
      adminName,
      adminEmail,
      createOpen,
      openCreateTenant: () => setCreateOpen(true),
      closeCreateTenant: () => setCreateOpen(false),
      can,
    }),
    [role, adminName, adminEmail, createOpen, can],
  );
  return <PlatformUiContext.Provider value={value}>{children}</PlatformUiContext.Provider>;
}

export function usePlatformUi(): PlatformUiValue {
  const ctx = useContext(PlatformUiContext);
  if (!ctx) {
    throw new Error("usePlatformUi must be used within PlatformUiProvider");
  }
  return ctx;
}

export function usePlatformUiOptional(): PlatformUiValue | null {
  return useContext(PlatformUiContext);
}
