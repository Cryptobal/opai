"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ClienteSession } from "@/lib/portal-cliente-types";
import { setPortalFetchUnauthorizedHandler } from "@/lib/portal-cliente-fetch";

type Ctx = {
  session: ClienteSession | null;
  loading: boolean;
  refetchSession: () => Promise<void>;
  logout: () => Promise<void>;
  applySession: (session: ClienteSession) => void;
  clearSession: () => void;
};

const PortalSessionContext = createContext<Ctx | null>(null);

export function PortalSessionProvider({
  initialSession,
  children,
}: {
  initialSession?: ClienteSession | null;
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<ClienteSession | null>(initialSession ?? null);
  const [loading, setLoading] = useState(!initialSession);

  const refetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/cliente/auth", { credentials: "include" });
      const json = await res.json();
      if (json.success && json.data) {
        setSession(json.data);
      } else {
        setSession(null);
      }
    } catch {
      // Keep existing session on network failure
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/portal/cliente/logout", { method: "POST" });
    } catch {}
    setSession(null);
  }, []);

  const applySession = useCallback((s: ClienteSession) => setSession(s), []);
  const clearSession = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (!initialSession) void refetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPortalFetchUnauthorizedHandler(() => setSession(null));
  }, []);

  return (
    <PortalSessionContext.Provider
      value={{ session, loading, refetchSession, logout, applySession, clearSession }}
    >
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession() {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSession must be used within PortalSessionProvider");
  return ctx;
}
