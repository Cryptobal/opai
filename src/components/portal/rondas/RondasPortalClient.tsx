"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LoginScreen } from "./LoginScreen";
import { DevicePairingScreen } from "./DevicePairingScreen";
import { GuardSelectorHeader } from "./GuardSelectorHeader";
import { MisRondas } from "./MisRondas";
import { RondaActiva } from "./RondaActiva";
import type { RondaData, CompletionData } from "./RondaActiva";
import { RondaCompletada } from "./RondaCompletada";
import { ReportarIncidente } from "./ReportarIncidente";
import { InstallBanner } from "./InstallBanner";
import { ChatRondasPortal } from "./ChatRondasPortal";
import { PushPermissionPrompt } from "@/components/pwa/PushPermissionPrompt";
import { PortalBottomNav } from "./PortalBottomNav";
import type { PortalTab } from "./PortalBottomNav";
import { PanicoModal } from "./PanicoModal";
import { PortalPerfil } from "./PortalPerfil";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { LogoutPinModal } from "@/components/portal/LogoutPinModal";

export type RondasScreen = "login" | "mis-rondas" | "ronda-activa" | "completada" | "chat" | "perfil";

export interface RondasSession {
  guardiaId: string;
  tenantId: string;
  installationId: string;
  nombre: string;
  installationName: string;
  authenticatedAt: string;
}

type AuthMode = "loading" | "pairing" | "legacy-login" | "ready";

interface DeviceInfo {
  installationId: string;
  installationName: string;
  tenantId: string;
}

export function RondasPortalClient() {
  const searchParams = useSearchParams();
  const [screen, setScreen] = useState<RondasScreen>("login");
  const [legacySession, setLegacySession] = useState<RondasSession | null>(null);
  const [activeEjecucionId, setActiveEjecucionId] = useState<string | null>(null);
  const [activeRondaData, setActiveRondaData] = useState<RondaData | null>(null);
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
  const [loadingRonda, setLoadingRonda] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showPanicoModal, setShowPanicoModal] = useState(false);
  const [panicBannerActive, setPanicBannerActive] = useState(false);
  const [incidentToast, setIncidentToast] = useState(false);

  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [currentGuard, setCurrentGuard] = useState<{ id: string; name: string } | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [legacyAuthEnabled, setLegacyAuthEnabled] = useState(false);

  useDeviceHeartbeat();

  useEffect(() => {
    fetch("/api/devices/legacy-auth-enabled")
      .then((r) => r.json())
      .then((json) => setLegacyAuthEnabled(json.enabled === true))
      .catch(() => {});
  }, []);

  // Online/offline tracking + retry pending incidents
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      // Retry pending offline incidents
      retryPendingIncidents();
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    // Also try on mount if already online
    if (navigator.onLine) retryPendingIncidents();
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  function retryPendingIncidents() {
    try {
      const raw = localStorage.getItem("pending-incidents");
      if (!raw) return;
      const pending = JSON.parse(raw) as Record<string, unknown>[];
      if (pending.length === 0) return;

      localStorage.removeItem("pending-incidents");
      const failed: Record<string, unknown>[] = [];

      Promise.allSettled(
        pending.map((inc) =>
          fetch("/api/portal/rondas/incidente", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(inc),
          }).then((r) => {
            if (!r.ok) failed.push(inc);
          }),
        ),
      )
        .then(() => {
          if (failed.length > 0) {
            localStorage.setItem("pending-incidents", JSON.stringify(failed));
          } else if (pending.length > 0) {
            setIncidentToast(true);
            setTimeout(() => setIncidentToast(false), 3500);
          }
        })
        .catch(() => {
          localStorage.setItem("pending-incidents", JSON.stringify(pending));
        });
    } catch {
      // Ignore parse errors
    }
  }

  // Init: determine auth mode on mount
  useEffect(() => {
    const token = safeStorage.getItem(DEVICE_TOKEN_KEY);

    if (token) {
      fetch("/api/devices/validate", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            setDeviceToken(token);
            setDeviceInfo({
              installationId: json.data.installationId,
              installationName: json.data.installationName,
              tenantId: json.data.tenantId,
            });
            if (json.data.currentGuardId && json.data.currentGuardName) {
              setCurrentGuard({
                id: json.data.currentGuardId,
                name: json.data.currentGuardName,
              });
            }
            if (json.data.portalRondasEnabled) {
              setAuthMode("ready");
              const sectionParam = searchParams.get("section");
              setScreen(sectionParam === "chat" ? "chat" : "mis-rondas");
            } else {
              setAuthMode("pairing");
            }
          } else {
            safeStorage.removeItem(DEVICE_TOKEN_KEY);
            setAuthMode("pairing");
          }
        })
        .catch(() => {
          // Offline — try cached legacy session
          const cachedSession = safeStorage.getItem("rondas_portal_session");
          if (cachedSession) {
            try {
              const { session: s } = JSON.parse(cachedSession);
              if (s.guardiaId && s.tenantId && s.installationId) {
                setDeviceToken(token);
                setDeviceInfo({
                  installationId: s.installationId,
                  installationName: s.installationName,
                  tenantId: s.tenantId,
                });
                setCurrentGuard({ id: s.guardiaId, name: s.nombre });
                setAuthMode("ready");
                setScreen("mis-rondas");
                return;
              }
            } catch {
              // ignore
            }
          }
          setAuthMode("pairing");
        });
    } else {
      // No device token — check for legacy session
      const raw = safeStorage.getItem("rondas_portal_session");
      if (raw) {
        try {
          const wrapped = JSON.parse(raw);
          const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - wrapped.storedAt <= MAX_SESSION_MS) {
            const s = wrapped.session as RondasSession;
            if (s.guardiaId && s.tenantId && s.installationId) {
              setLegacySession(s);
              setDeviceInfo({
                installationId: s.installationId,
                installationName: s.installationName,
                tenantId: s.tenantId,
              });
              setCurrentGuard({ id: s.guardiaId, name: s.nombre });
              setAuthMode("ready");
              const sectionParam = searchParams.get("section");
              setScreen(sectionParam === "chat" ? "chat" : "mis-rondas");
              return;
            }
          }
        } catch {
          // ignore
        }
      }
      setAuthMode("pairing");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive session from device+guard (for paired devices)
  const derivedSession: RondasSession | null = useMemo(() => {
    if (!deviceInfo || !currentGuard) return null;
    return {
      guardiaId: currentGuard.id,
      tenantId: deviceInfo.tenantId,
      installationId: deviceInfo.installationId,
      nombre: currentGuard.name,
      installationName: deviceInfo.installationName,
      authenticatedAt: new Date().toISOString(),
    };
  }, [deviceInfo, currentGuard]);

  // The active session: prefer derived (device+guard), fall back to legacy
  const session: RondasSession | null = derivedSession ?? legacySession;

  // --- Handlers ---

  const handlePaired = (data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
  }) => {
    setDeviceToken(data.deviceToken);
    // We don't know tenantId from pair response alone — validate to get it
    fetch("/api/devices/validate", {
      headers: { Authorization: `Bearer ${data.deviceToken}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setDeviceInfo({
            installationId: json.data.installationId,
            installationName: json.data.installationName,
            tenantId: json.data.tenantId,
          });
          if (json.data.currentGuardId && json.data.currentGuardName) {
            setCurrentGuard({
              id: json.data.currentGuardId,
              name: json.data.currentGuardName,
            });
          }
          setAuthMode("ready");
          setScreen("mis-rondas");
        }
      })
      .catch(() => {
        setDeviceInfo({
          installationId: data.installationId,
          installationName: data.installationName,
          tenantId: "",
        });
        setAuthMode("ready");
        setScreen("mis-rondas");
      });
  };

  const handleLogin = (newSession: RondasSession) => {
    setLegacySession(newSession);
    setDeviceInfo({
      installationId: newSession.installationId,
      installationName: newSession.installationName,
      tenantId: newSession.tenantId,
    });
    setCurrentGuard({ id: newSession.guardiaId, name: newSession.nombre });
    setAuthMode("ready");
    setScreen("mis-rondas");
  };

  const [showLogoutPin, setShowLogoutPin] = useState(false);

  const doFullLogout = () => {
    safeStorage.removeItem(DEVICE_TOKEN_KEY);
    safeStorage.removeItem("rondas_portal_session");
    setDeviceToken(null);
    setDeviceInfo(null);
    setCurrentGuard(null);
    setLegacySession(null);
    setActiveRondaData(null);
    setActiveEjecucionId(null);
    setCompletionData(null);
    setShowIncidentModal(false);
    setAuthMode("pairing");
    setScreen("login");
  };

  const handleLogout = () => {
    if (deviceToken) {
      setShowLogoutPin(true);
    } else {
      doFullLogout();
    }
  };

  const handleGuardChange = (guard: { id: string; name: string } | null) => {
    setCurrentGuard(guard);
    if (guard && deviceInfo) {
      const s: RondasSession = {
        guardiaId: guard.id,
        tenantId: deviceInfo.tenantId,
        installationId: deviceInfo.installationId,
        nombre: guard.name,
        installationName: deviceInfo.installationName,
        authenticatedAt: new Date().toISOString(),
      };
      safeStorage.setItem(
        "rondas_portal_session",
        JSON.stringify({ session: s, storedAt: Date.now() }),
      );
    }
  };

  // --- Ronda navigation ---

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

  const handleIniciarRonda = useCallback(
    async (ejecucionId: string) => {
      if (!session) return;
      setLoadingRonda(true);
      setActiveEjecucionId(ejecucionId);

      try {
        await fetch("/api/portal/rondas/iniciar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ejecucionId,
            guardiaId: session.guardiaId,
          }),
        });
      } catch {
        // Non-blocking
      }

      const data = await fetchRondaData(ejecucionId);
      setLoadingRonda(false);
      if (data) {
        setActiveRondaData(data);
        setScreen("ronda-activa");
      }
    },
    [fetchRondaData, session],
  );

  const handleIniciarRondaLibre = useCallback(async () => {
    if (!session) return;
    setLoadingRonda(true);
    try {
      const res = await fetch("/api/portal/rondas/iniciar-libre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: session.guardiaId,
          installationId: session.installationId,
          tenantId: session.tenantId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setLoadingRonda(false);
        alert(json.error || "No se pudo iniciar la ronda libre");
        return;
      }

      const ejecucionId = json.data.ejecucionId;
      setActiveEjecucionId(ejecucionId);

      // If resuming an existing ronda, fetch full data (may have checkpoints already)
      if (json.data.resumed) {
        const fullData = await fetchRondaData(ejecucionId);
        if (fullData) {
          setActiveRondaData(fullData);
          setScreen("ronda-activa");
          return;
        }
      }

      setActiveRondaData({
        ejecucionId,
        templateId: "",
        templateName: "Ronda Libre",
        status: "en_curso",
        scheduledAt: new Date().toISOString(),
        startedAt: json.data.startedAt,
        checkpointsTotal: 0,
        checkpointsCompletados: 0,
        qrRequerido: false,
        orderMode: "flexible",
        estimatedDurationMin: null,
        checkpoints: [],
      });
      setScreen("ronda-activa");
    } catch {
      // Network error
    } finally {
      setLoadingRonda(false);
    }
  }, [session]);

  const handleRondaComplete = (data: CompletionData) => {
    setCompletionData(data);
    setScreen("completada");
  };

  const handleBackToRondas = () => {
    setActiveRondaData(null);
    setActiveEjecucionId(null);
    setCompletionData(null);
    setScreen("mis-rondas");
  };

  const handleBottomNav = (tab: PortalTab) => {
    if (tab === "panico") {
      setShowPanicoModal(true);
      return;
    }
    if (tab === "incidente") {
      setShowIncidentModal(true);
      return;
    }
    if (tab === "mis-rondas" && (screen === "ronda-activa" || screen === "completada")) {
      return;
    }
    setScreen(tab);
  };

  // --- Render ---

  if (authMode === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0A0F1C]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          <span className="text-sm text-zinc-400">Cargando...</span>
        </div>
      </div>
    );
  }

  if (authMode === "pairing") {
    return (
      <DevicePairingScreen
        onPaired={handlePaired}
        onLegacyLogin={legacyAuthEnabled ? () => setAuthMode("legacy-login") : undefined}
      />
    );
  }

  if (authMode === "legacy-login") {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // authMode === "ready"
  const showGuardSelector = deviceToken && deviceInfo && screen !== "login";
  const needsGuardWarning = authMode === "ready" && !currentGuard;

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {isOffline && (
        <div
          className="fixed top-0 inset-x-0 z-50 bg-amber-600 px-4 py-2 text-center text-sm font-medium text-white"
          role="status"
        >
          Sin conexion — modo offline
        </div>
      )}
      {isOffline && <div className="h-10 shrink-0" aria-hidden="true" />}

      {panicBannerActive && (
        <div className="fixed inset-x-0 top-0 z-[65] flex items-center justify-center gap-2 bg-red-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">
          <span className="animate-pulse text-lg">{"\uD83D\uDEA8"}</span>
          Alerta de panico activa — Central notificada
        </div>
      )}
      {panicBannerActive && <div className="h-10 shrink-0" aria-hidden="true" />}

      {showGuardSelector && (
        <GuardSelectorHeader
          installationName={deviceInfo.installationName}
          deviceToken={deviceToken}
          currentGuardId={currentGuard?.id ?? null}
          currentGuardName={currentGuard?.name ?? null}
          onGuardChange={handleGuardChange}
        />
      )}

      {needsGuardWarning && screen !== "login" && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-300">
          Selecciona un guardia para continuar
        </div>
      )}

      {screen === "mis-rondas" && session && (
        <>
          <div className="px-4 pt-2">
            <PushPermissionPrompt
              portalType="rondas"
              userType="guardia"
              userId={session.guardiaId}
              tenantId={session.tenantId}
            />
          </div>
          <MisRondas
            session={session}
            onIniciarRonda={handleIniciarRonda}
            onIniciarRondaLibre={handleIniciarRondaLibre}
            onReportIncident={() => setShowIncidentModal(true)}
          />
          {loadingRonda && (
            <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60">
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-gray-900 px-8 py-6">
                <svg
                  className="h-8 w-8 animate-spin text-teal-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
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
          onComplete={handleRondaComplete}
          onBack={() => {
            setActiveRondaData(null);
            setActiveEjecucionId(null);
            setScreen("mis-rondas");
          }}
          onReportIncident={() => setShowIncidentModal(true)}
        />
      )}

      {screen === "completada" && session && completionData && (
        <RondaCompletada
          trustScore={completionData.trustScore}
          trustBreakdown={completionData.trustBreakdown}
          porcentajeCompletado={completionData.porcentajeCompletado}
          durationMinutes={completionData.durationMinutes}
          missed={completionData.missed}
          checkpoints={completionData.checkpoints}
          scheduledAt={completionData.scheduledAt}
          startedAt={completionData.startedAt}
          onBackToRondas={handleBackToRondas}
        />
      )}

      {screen === "chat" && session && (
        <div className="flex-1 min-h-0 overflow-hidden pb-16">
          <ChatRondasPortal session={session} onBack={() => setScreen("mis-rondas")} />
        </div>
      )}

      {screen === "perfil" && session && (
        <PortalPerfil session={session} onLogout={handleLogout} />
      )}

      {showIncidentModal && session && (
        <ReportarIncidente
          session={session}
          activeEjecucionId={activeEjecucionId ?? undefined}
          onClose={() => setShowIncidentModal(false)}
          onSubmitted={() => {
            setShowIncidentModal(false);
            setIncidentToast(true);
            navigator.vibrate?.([100, 50, 100]);
            setTimeout(() => setIncidentToast(false), 3500);
          }}
        />
      )}

      {/* Incident submitted toast */}
      {incidentToast && (
        <div className="fixed top-4 inset-x-4 z-[70] flex items-center gap-3 rounded-xl border border-green-700/50 bg-green-950/90 px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-green-300">Incidente reportado</p>
            <p className="text-xs text-green-400/70">Central ha sido notificada</p>
          </div>
          <button onClick={() => setIncidentToast(false)} className="text-green-400/50 hover:text-green-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {session && screen !== "login" && (
        <PortalBottomNav activeScreen={screen} onNavigate={handleBottomNav} />
      )}

      {showPanicoModal && session && (
        <PanicoModal
          session={session}
          activeEjecucionId={activeEjecucionId}
          onClose={() => setShowPanicoModal(false)}
          onPanicSent={() => {
            setShowPanicoModal(false);
            setPanicBannerActive(true);
          }}
        />
      )}

      <InstallBanner />

      <LogoutPinModal
        open={showLogoutPin}
        deviceToken={deviceToken ?? ""}
        onConfirm={() => { setShowLogoutPin(false); doFullLogout(); }}
        onCancel={() => setShowLogoutPin(false)}
      />
    </div>
  );
}
