"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { PreRondaScreen } from "./components/PreRondaScreen";
import { RondaActivaScreen } from "./components/RondaActivaScreen";
import { RondaCompletadaScreen } from "./components/RondaCompletadaScreen";
import { QrScannerReal } from "./components/QrScannerReal";
import { AudioRecorder } from "./components/AudioRecorder";
import { useGeolocation } from "@/lib/patrullaje/use-geolocation";
import { addToQueue, getQueue, clearQueue, type OfflineMarcacion } from "@/lib/patrullaje/offline-store";

type Screen = "login" | "pre-ronda" | "ronda-activa" | "completada";

interface Installation {
  id: string;
  name: string;
  address: string | null;
  commune: string | null;
  lat: number | null;
  lng: number | null;
  tenantId: string;
}

interface SessionData {
  guardiaId: string;
  guardiaNombre: string;
  sessionId: string;
  deviceId: string;
}

interface CheckpointData {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  verificationType: string;
  qrCode: string;
  isCritical: boolean;
  order: number;
  isRequired: boolean;
}

interface MarkedCheckpoint {
  checkpointId: string;
  markedAt: string;
  hasPhoto?: boolean;
  hasAudio?: boolean;
}

interface CompletedData {
  trustScore: number;
  trustBreakdown?: Record<string, { score: number; weight: number; detail?: string }>;
  porcentajeCompletado: number;
  durationMinutes: number | null;
  missed: number;
}

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

export function PatrullajeClient({ installation }: { installation: Installation }) {
  const [screen, setScreen] = useState<Screen>("login");
  const [session, setSession] = useState<SessionData | null>(null);
  const [rondas, setRondas] = useState<any[]>([]);
  const [activeExecId, setActiveExecId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointData[]>([]);
  const [markedCheckpoints, setMarkedCheckpoints] = useState<MarkedCheckpoint[]>([]);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [completedData, setCompletedData] = useState<CompletedData | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [noteCheckpointId, setNoteCheckpointId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showNoteModal, setShowNoteModal] = useState(false);

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCheckpointForMedia = useRef<string | null>(null);

  const isRondaActive = screen === "ronda-activa";
  const { position, permissionGranted, requestPermission } = useGeolocation(isRondaActive || screen === "pre-ronda");

  // Offline detection
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Sync offline queue when back online
  useEffect(() => {
    if (isOffline || !activeExecId || !session) return;
    syncOfflineQueue();
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inactivity timeout
  useEffect(() => {
    if (screen === "login") return;

    const resetTimer = () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      inactivityRef.current = setTimeout(() => {
        handleLogout();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["touchstart", "mousedown", "keydown", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Request geo permission on pre-ronda
  useEffect(() => {
    if (screen === "pre-ronda" && !permissionGranted) {
      requestPermission();
    }
  }, [screen, permissionGranted, requestPermission]);

  const handleLogin = useCallback((data: {
    guardiaId: string;
    guardiaNombre: string;
    sessionId: string;
    rondas: any[];
    deviceId: string;
  }) => {
    setSession({
      guardiaId: data.guardiaId,
      guardiaNombre: data.guardiaNombre,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
    });
    setRondas(data.rondas);
    setScreen("pre-ronda");
  }, []);

  const handleLogout = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await fetch("/api/patrol/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        });
      } catch { /* ignore */ }
    }
    setSession(null);
    setRondas([]);
    setActiveExecId(null);
    setCheckpoints([]);
    setMarkedCheckpoints([]);
    setCompletedData(null);
    setScreen("login");
  }, [session?.sessionId]);

  const handleStartRonda = useCallback(async (execId: string) => {
    if (!session) return;

    const res = await fetch("/api/public/ronda/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "",
        rut: "",
        pin: "",
        ejecucionId: execId,
        deviceInfo: { userAgent: navigator.userAgent, deviceId: session.deviceId },
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error ?? "No se pudo iniciar ronda");
    }

    const cpData: CheckpointData[] = (json.data?.checkpoints ?? []).map((cp: any) => ({
      id: cp.id,
      name: cp.name,
      lat: cp.lat,
      lng: cp.lng,
      radius: cp.radius ?? 30,
      verificationType: cp.verificationType ?? "GEOFENCE",
      qrCode: cp.qrCode ?? "",
      isCritical: cp.isCritical ?? false,
      order: cp.order ?? 0,
      isRequired: cp.isRequired ?? true,
    }));

    setActiveExecId(execId);
    setCheckpoints(cpData);
    setMarkedCheckpoints([]);
    setStartedAt(new Date());
    setScreen("ronda-activa");
  }, [session]);

  const handleMarkGeo = useCallback(async (checkpointId: string) => {
    if (!activeExecId || !session || !position) return;

    const payload = {
      executionId: activeExecId,
      checkpointId,
      lat: position.lat,
      lng: position.lng,
      verificationMethod: "GEOFENCE" as const,
      batteryLevel: null as number | null,
      motionData: null,
      isOfflineSync: isOffline,
    };

    if (isOffline) {
      await addToQueue({
        executionId: activeExecId,
        checkpointId,
        lat: position.lat,
        lng: position.lng,
        verificationMethod: "GEOFENCE",
        marcadoAt: new Date().toISOString(),
      });
      setMarkedCheckpoints((prev) => [
        ...prev,
        { checkpointId, markedAt: new Date().toISOString() },
      ]);
      return;
    }

    const res = await fetch("/api/public/ronda/marcar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error ?? "No se pudo marcar");
    }

    setMarkedCheckpoints((prev) => [
      ...prev,
      { checkpointId, markedAt: new Date().toISOString() },
    ]);
  }, [activeExecId, session, position, isOffline]);

  const handleMarkQr = useCallback(async (checkpointId: string, qrCode: string) => {
    if (!activeExecId || !position) return;

    const res = await fetch("/api/public/ronda/marcar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        executionId: activeExecId,
        checkpointQrCode: qrCode,
        lat: position?.lat ?? 0,
        lng: position?.lng ?? 0,
        verificationMethod: "QR",
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) return;

    setMarkedCheckpoints((prev) => [
      ...prev,
      { checkpointId, markedAt: new Date().toISOString() },
    ]);
  }, [activeExecId, position]);

  const handleQrScanned = useCallback((value: string) => {
    setShowQrScanner(false);
    const cp = checkpoints.find(
      (c) => c.qrCode === value || c.id === value,
    );
    if (cp) {
      handleMarkQr(cp.id, value);
    }
  }, [checkpoints, handleMarkQr]);

  const handleComplete = useCallback(async () => {
    if (!activeExecId) return;

    const res = await fetch("/api/public/ronda/completar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: activeExecId }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) return;

    setCompletedData({
      trustScore: json.data.trustScore ?? 0,
      trustBreakdown: json.data.trustBreakdown,
      porcentajeCompletado: json.data.porcentajeCompletado ?? 0,
      durationMinutes: json.data.durationMinutes,
      missed: json.data.missed ?? 0,
    });
    setScreen("completada");
  }, [activeExecId]);

  const handlePanic = useCallback(async () => {
    if (!activeExecId || !position) return;
    try {
      await fetch("/api/public/ronda/panico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionId: activeExecId,
          lat: position.lat,
          lng: position.lng,
        }),
      });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch { /* ignore */ }
  }, [activeExecId, position]);

  const syncOfflineQueue = async () => {
    const queue = await getQueue();
    if (!queue.length) return;

    try {
      const rounds = [{
        templateId: rondas.find((r) => r.id === activeExecId)?.rondaTemplateId ?? "",
        installationId: installation.id,
        guardiaId: session?.guardiaId ?? "",
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        marcaciones: queue.map((m) => ({
          checkpointId: m.checkpointId,
          lat: m.lat,
          lng: m.lng,
          verificationMethod: m.verificationMethod,
          marcadoAt: m.marcadoAt,
          photoUrl: m.photoUrl,
          audioUrl: m.audioUrl,
          note: m.note,
        })),
      }];

      const res = await fetch("/api/public/ronda/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rounds }),
      });
      if (res.ok) {
        await clearQueue();
      }
    } catch { /* will retry on next online event */ }
  };

  const handleOpenPhoto = (cpId: string) => {
    activeCheckpointForMedia.current = cpId;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => {
      // For now, just mark that photo was taken
      const file = input.files?.[0];
      if (file) {
        setMarkedCheckpoints((prev) =>
          prev.map((m) =>
            m.checkpointId === cpId ? { ...m, hasPhoto: true } : m,
          ),
        );
      }
    };
    input.click();
  };

  const handleOpenAudio = (cpId: string) => {
    activeCheckpointForMedia.current = cpId;
    setShowAudioRecorder(true);
  };

  const handleAudioRecorded = (_blob: Blob) => {
    const cpId = activeCheckpointForMedia.current;
    if (cpId) {
      setMarkedCheckpoints((prev) =>
        prev.map((m) =>
          m.checkpointId === cpId ? { ...m, hasAudio: true } : m,
        ),
      );
    }
    setShowAudioRecorder(false);
  };

  const handleOpenNote = (cpId: string) => {
    setNoteCheckpointId(cpId);
    setNoteText("");
    setShowNoteModal(true);
  };

  const handleSaveNote = () => {
    setShowNoteModal(false);
    setNoteCheckpointId(null);
  };

  return (
    <>
      {screen === "login" && (
        <LoginScreen
          installationName={installation.name}
          installationId={installation.id}
          onLogin={handleLogin}
        />
      )}

      {screen === "pre-ronda" && session && (
        <PreRondaScreen
          guardiaNombre={session.guardiaNombre}
          rondas={rondas}
          installationName={installation.name}
          gpsReady={permissionGranted}
          onStart={handleStartRonda}
          onLogout={handleLogout}
        />
      )}

      {screen === "ronda-activa" && activeExecId && (
        <RondaActivaScreen
          templateName={rondas.find((r) => r.id === activeExecId)?.rondaTemplate?.name ?? "Ronda"}
          checkpoints={checkpoints}
          markedCheckpoints={markedCheckpoints}
          position={position}
          isOffline={isOffline}
          onMarkGeo={handleMarkGeo}
          onMarkQr={handleMarkQr}
          onOpenQrScanner={() => setShowQrScanner(true)}
          onOpenPhoto={handleOpenPhoto}
          onOpenAudio={handleOpenAudio}
          onOpenNote={handleOpenNote}
          onComplete={handleComplete}
          onPanic={handlePanic}
          startedAt={startedAt}
        />
      )}

      {screen === "completada" && completedData && (
        <RondaCompletadaScreen
          trustScore={completedData.trustScore}
          trustBreakdown={completedData.trustBreakdown}
          checkpointsCompleted={markedCheckpoints.length}
          checkpointsTotal={checkpoints.length}
          durationMinutes={completedData.durationMinutes}
          missed={completedData.missed}
          onLogout={handleLogout}
        />
      )}

      {/* QR Scanner modal */}
      {showQrScanner && (
        <QrScannerReal
          onScan={handleQrScanned}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {/* Audio Recorder modal */}
      {showAudioRecorder && (
        <AudioRecorder
          onRecorded={handleAudioRecorded}
          onClose={() => setShowAudioRecorder(false)}
        />
      )}

      {/* Note modal */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
          <div className="w-full max-w-sm space-y-4">
            <h3 className="text-sm font-medium text-white">Observación</h3>
            <textarea
              className="w-full h-32 rounded-xl bg-white/5 border border-white/10 p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/50 resize-none"
              placeholder="Escribe tu observación..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              maxLength={1000}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNoteModal(false)}
                className="flex-1 h-12 rounded-lg bg-white/5 border border-white/10 text-sm text-white/50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNote}
                className="flex-1 h-12 rounded-lg bg-emerald-500 text-sm font-semibold text-white active:scale-[0.98]"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
