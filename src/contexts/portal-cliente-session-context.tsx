"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ClienteSession } from "@/lib/portal-cliente-types";
import { setPortalFetchUnauthorizedHandler } from "@/lib/portal-cliente-fetch";

type Ctx = {
  session: ClienteSession | null;
  loading: boolean;
  refetchSession: () => Promise<void>;
  logout: () => Promise<void>;
  applySession: (session: ClienteSession, token?: string) => void;
  clearSession: () => void;
};

const PortalSessionContext = createContext<Ctx | null>(null);

// Backup del token de sesión en localStorage. iOS Safari en modo PWA
// (Add to Home Screen) purga las cookies al cerrar la app, lo que
// expulsaba al usuario al login cada vez. localStorage SÍ persiste en
// PWA standalone, así que lo usamos para restaurar la sesión vía un
// header `Authorization: Bearer <token>` (el server reescribe la cookie).
const TOKEN_STORAGE_KEY = "portal_cliente_session_token";

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStoredToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}
function clearStoredToken() {
  writeStoredToken(null);
}

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
      const storedToken = readStoredToken();
      const headers: Record<string, string> = {};
      if (storedToken) headers["Authorization"] = `Bearer ${storedToken}`;
      const res = await fetch("/api/portal/cliente/auth", {
        credentials: "include",
        headers,
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json.data) {
        setSession(json.data);
        // El server siempre devuelve un token fresco; lo refrescamos en
        // localStorage para que el próximo cold-start del PWA lo encuentre
        // si iOS purgó la cookie.
        if (typeof json.token === "string" && json.token.length > 0) {
          writeStoredToken(json.token);
        }
      } else {
        // 401 / error explícito → no hay sesión válida en cookie ni en token.
        // Limpiamos localStorage para no reintentar con un token muerto.
        setSession(null);
        if (res.status === 401) clearStoredToken();
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
    clearStoredToken();
    setSession(null);
  }, []);

  const applySession = useCallback((s: ClienteSession, token?: string) => {
    setSession(s);
    if (token) writeStoredToken(token);
  }, []);
  const clearSession = useCallback(() => {
    clearStoredToken();
    setSession(null);
  }, []);

  useEffect(() => {
    if (!initialSession) void refetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPortalFetchUnauthorizedHandler(() => {
      clearStoredToken();
      setSession(null);
    });
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
