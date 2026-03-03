"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { LoginScreen } from "./LoginScreen";
import { MisRondas } from "./MisRondas";
import { RondaActiva } from "./RondaActiva";
import type { RondaData, CompletionData } from "./RondaActiva";
import { RondaCompletada } from "./RondaCompletada";
import { CheckpointMarker } from "./CheckpointMarker";
import type { CheckpointInfo, MarcarResult } from "./CheckpointMarker";

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
  const [activeRondaData, setActiveRondaData] = useState<RondaData | null>(null);
  const [activeCheckpointId, setActiveCheckpointId] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [loadingRonda, setLoadingRonda] = useState(false);

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
    setActiveRondaData(null);
    setActiveEjecucionId(null);
    setActiveCheckpointId(null);
    setCompletionData(null);
    setScreen("login");
    sessionStorage.removeItem("rondas_portal_session");
    sessionStorage.removeItem("rondas_portal_auth_temp");
  };

  // Fetch fresh ronda data for the active ejecucion
  const fetchRondaData = useCallback(
    async (ejecucionId: string): Promise<RondaData | null> => {
      if (!session) return null;
      try {
        const params = new URLSearchParams({
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          tenantId: session.tenantId,
        });
        const res = await fetch(`/api/portal/rondas/mis-rondas?${params.toString()}`);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.success || !json.data) return null;
        const found = (json.data as RondaData[]).find((r) => r.ejecucionId === ejecucionId);
        return found ?? null;
      } catch {
        return null;
      }
    },
    [session],
  );

  // Navigate: mis-rondas -> ronda-activa
  const handleIniciarRonda = useCallback(
    async (ejecucionId: string) => {
      setLoadingRonda(true);
      setActiveEjecucionId(ejecucionId);
      const data = await fetchRondaData(ejecucionId);
      setLoadingRonda(false);
      if (data) {
        setActiveRondaData(data);
        setScreen("ronda-activa");
      }
    },
    [fetchRondaData],
  );

  // Navigate: ronda-activa -> marcar
  const handleMark = (checkpointId: string) => {
    setActiveCheckpointId(checkpointId);
    setScreen("marcar");
  };

  // Navigate: marcar -> ronda-activa (after successful marking)
  const handleMarcarComplete = useCallback(
    async (_result: MarcarResult) => {
      // Refresh ronda data to get updated checkpoint statuses
      if (activeEjecucionId) {
        const data = await fetchRondaData(activeEjecucionId);
        if (data) {
          setActiveRondaData(data);
        }
      }
      setActiveCheckpointId(null);
      setScreen("ronda-activa");
    },
    [activeEjecucionId, fetchRondaData],
  );

  // Navigate: ronda-activa -> completada
  const handleRondaComplete = (data: CompletionData) => {
    setCompletionData(data);
    setScreen("completada");
  };

  // Navigate: completada -> mis-rondas
  const handleBackToRondas = () => {
    setActiveRondaData(null);
    setActiveEjecucionId(null);
    setActiveCheckpointId(null);
    setCompletionData(null);
    setScreen("mis-rondas");
  };

  // Build CheckpointInfo from rondaData for the active checkpoint
  const activeCheckpoint = useMemo<CheckpointInfo | null>(() => {
    if (!activeRondaData || !activeCheckpointId) return null;
    const cp = activeRondaData.checkpoints.find((c) => c.id === activeCheckpointId);
    if (!cp) return null;
    return {
      id: cp.id,
      name: cp.name,
      lat: cp.lat,
      lng: cp.lng,
      geoRadiusM: cp.geoRadiusM,
      verificationType: cp.verificationType,
    };
  }, [activeRondaData, activeCheckpointId]);

  return (
    <div className="flex min-h-dvh flex-col">
      {screen === "login" && <LoginScreen onLogin={handleLogin} />}

      {screen === "mis-rondas" && session && (
        <>
          <MisRondas
            session={session}
            onLogout={handleLogout}
            onIniciarRonda={handleIniciarRonda}
          />
          {loadingRonda && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-gray-900 px-8 py-6">
                <svg
                  className="h-8 w-8 animate-spin text-teal-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-base text-gray-300">Cargando ronda...</span>
              </div>
            </div>
          )}
        </>
      )}

      {screen === "ronda-activa" && session && activeRondaData && (
        <RondaActiva
          session={session}
          rondaData={activeRondaData}
          onMark={handleMark}
          onComplete={handleRondaComplete}
          onBack={() => {
            setActiveRondaData(null);
            setActiveEjecucionId(null);
            setScreen("mis-rondas");
          }}
        />
      )}

      {screen === "marcar" && session && activeCheckpoint && activeRondaData && activeEjecucionId && (
        <CheckpointMarker
          checkpoint={activeCheckpoint}
          ejecucionId={activeEjecucionId}
          guardiaId={session.guardiaId}
          qrRequerido={activeRondaData.qrRequerido}
          onComplete={handleMarcarComplete}
          onBack={() => {
            setActiveCheckpointId(null);
            setScreen("ronda-activa");
          }}
        />
      )}

      {screen === "completada" && session && completionData && (
        <RondaCompletada
          trustScore={completionData.trustScore}
          porcentajeCompletado={completionData.porcentajeCompletado}
          durationMinutes={completionData.durationMinutes}
          missed={completionData.missed}
          onBackToRondas={handleBackToRondas}
        />
      )}
    </div>
  );
}
