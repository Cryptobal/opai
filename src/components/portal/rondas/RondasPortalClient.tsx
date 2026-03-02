"use client";

import { useState, useEffect } from "react";
import { LoginScreen } from "./LoginScreen";
import { MisRondas } from "./MisRondas";

export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "marcar" | "completada";

export interface RondasSession {
  guardiaId: string;
  tenantId: string;
  installationId: string;
  nombre: string;
  installationName: string;
  authenticatedAt: string;
}

export function RondasPortalClient() {
  const [screen, setScreen] = useState<RondasScreen>("login");
  const [session, setSession] = useState<RondasSession | null>(null);
  const [activeEjecucionId, setActiveEjecucionId] = useState<string | null>(null);

  // Restore session from sessionStorage on mount (with 12h TTL)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("rondas_portal_session");
      if (stored) {
        const parsed = JSON.parse(stored) as RondasSession;
        if (parsed.guardiaId && parsed.tenantId && parsed.installationId) {
          const elapsed = Date.now() - new Date(parsed.authenticatedAt).getTime();
          const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
          if (elapsed > MAX_SESSION_MS) {
            sessionStorage.removeItem("rondas_portal_session");
            sessionStorage.removeItem("rondas_portal_auth_temp");
            return;
          }
          setSession(parsed);
          setScreen("mis-rondas");
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleLogin = (newSession: RondasSession) => {
    setSession(newSession);
    setScreen("mis-rondas");
  };

  const handleLogout = () => {
    setSession(null);
    setScreen("login");
    sessionStorage.removeItem("rondas_portal_session");
    sessionStorage.removeItem("rondas_portal_auth_temp");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}
      {screen === "mis-rondas" && session && (
        <MisRondas
          session={session}
          onLogout={handleLogout}
          onIniciarRonda={(ejecucionId) => {
            setActiveEjecucionId(ejecucionId);
            setScreen("ronda-activa");
          }}
        />
      )}
      {screen === "ronda-activa" && session && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="text-lg text-gray-400">Ronda Activa</p>
            <p className="text-sm text-gray-500">ID: {activeEjecucionId}</p>
            <button
              onClick={() => setScreen("mis-rondas")}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700"
            >
              Volver
            </button>
          </div>
        </div>
      )}
      {(screen === "marcar" || screen === "completada") && session && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="text-center space-y-4">
            <p className="text-lg text-gray-400">{screen === "marcar" ? "Marcar Checkpoint" : "Ronda Completada"}</p>
            <button
              onClick={() => setScreen("mis-rondas")}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
