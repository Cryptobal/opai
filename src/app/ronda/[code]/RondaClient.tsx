"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrScanner } from "@/components/ops/rondas/qr-scanner";
import { RondaProgress } from "@/components/ops/rondas/ronda-progress";

type Screen = "login" | "rondas" | "ejecucion" | "final";

export function RondaClient({ code }: { code: string }) {
  const [screen, setScreen] = useState<Screen>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rut, setRut] = useState("");
  const [pin, setPin] = useState("");
  const [guardiaName, setGuardiaName] = useState("");
  const [rondas, setRondas] = useState<any[]>([]);
  const [activeExecution, setActiveExecution] = useState<any | null>(null);
  const [marksCount, setMarksCount] = useState(0);
  const [completedInfo, setCompletedInfo] = useState<any | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [motionScore, setMotionScore] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);

  useEffect(() => {
    const onlineHandler = () => setIsOffline(false);
    const offlineHandler = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if ("getBattery" in navigator) {
      (navigator as Navigator & { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((b) => {
          if (mounted) setBatteryLevel(Math.round(b.level * 100));
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const onMotion = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (!a) return;
      const magnitude = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      setMotionScore((prev) => Math.max(0, Math.min(10, (prev * 0.8) + (magnitude * 0.2))));
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  const canMark = useMemo(() => !!activeExecution, [activeExecution]);

  const login = async () => {
    setError(null);
    setLoading(true);
    try {
      const authRes = await fetch("/api/public/ronda/autenticar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, rut, pin }),
      });
      const authJson = await authRes.json();
      if (!authRes.ok || !authJson.success) {
        setError(authJson.error ?? "No se pudo autenticar");
        return;
      }
      setGuardiaName(authJson.data.guardiaNombre);

      const pendingRes = await fetch(
        `/api/public/ronda/pendientes?code=${encodeURIComponent(code)}&rut=${encodeURIComponent(rut)}&pin=${encodeURIComponent(pin)}`
      );
      const pendingJson = await pendingRes.json();
      if (!pendingRes.ok || !pendingJson.success) {
        setError(pendingJson.error ?? "No se pudieron cargar rondas");
        return;
      }
      setRondas(pendingJson.data.rondas);
      setScreen("rondas");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const startExecution = async (execId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/ronda/iniciar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          rut,
          pin,
          ejecucionId: execId,
          deviceInfo: {
            userAgent: navigator.userAgent,
            batteryLevel,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo iniciar ronda");
        return;
      }
      const selected = rondas.find((r) => r.id === execId) ?? null;
      setActiveExecution(selected);
      setMarksCount(selected?.marcaciones?.length ?? 0);
      setScreen("ejecucion");
    } finally {
      setLoading(false);
    }
  };

  const getCoords = async () => {
    return await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  };

  const flushQueue = async () => {
    if (!offlineQueue.length) return;
    const queue = [...offlineQueue];
    const rest: any[] = [];
    for (const item of queue) {
      try {
        const res = await fetch("/api/public/ronda/marcar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        const json = await res.json();
        if (!res.ok || !json.success) rest.push(item);
        else setMarksCount((prev) => prev + 1);
      } catch {
        rest.push(item);
      }
    }
    setOfflineQueue(rest);
  };

  useEffect(() => {
    if (!isOffline) void flushQueue();
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const markCheckpoint = async (checkpointQrCode: string) => {
    if (!activeExecution?.id) return;
    setError(null);
    try {
      const coords = await getCoords();
      const payload = {
        executionId: activeExecution.id,
        checkpointQrCode,
        lat: coords.lat,
        lng: coords.lng,
        batteryLevel,
        motionData: { movementScore: motionScore },
      };
      if (isOffline) {
        setOfflineQueue((prev) => [...prev, payload]);
        return;
      }
      const res = await fetch("/api/public/ronda/marcar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo marcar checkpoint");
        return;
      }
      setMarksCount((prev) => prev + 1);
      if (navigator.vibrate) navigator.vibrate(120);
    } catch {
      setError("No se pudo obtener geolocalización");
    }
  };

  const completeExecution = async () => {
    if (!activeExecution?.id) return;
    const res = await fetch("/api/public/ronda/completar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: activeExecution.id }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setError(json.error ?? "No se pudo completar ronda");
      return;
    }
    setCompletedInfo(json.data);
    setScreen("final");
  };

  const panic = async () => {
    if (!activeExecution?.id) return;
    try {
      const coords = await getCoords();
      await fetch("/api/public/ronda/panico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId: activeExecution.id, lat: coords.lat, lng: coords.lng }),
      });
      setError("Alerta de pánico enviada");
    } catch {
      setError("No se pudo enviar alerta de pánico");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      {screen === "login" && (
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Control de rondas</h1>
          </div>
          <p className="text-sm text-muted-foreground">Instalación: {code}</p>
          <Input className="h-14 text-base" placeholder="RUT" value={rut} onChange={(e) => setRut(e.target.value)} />
          <Input className="h-14 text-base" type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
          <Button className="h-14 w-full text-base font-semibold" onClick={login} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ingresar"}
          </Button>
        </div>
      )}

      {screen === "rondas" && (
        <div className="mx-auto max-w-md space-y-3">
          <h2 className="text-base font-semibold">Hola, {guardiaName}</h2>
          {rondas.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <p className="text-sm font-medium">{r.rondaTemplate.name}</p>
              <p className="text-xs text-muted-foreground">{new Date(r.scheduledAt).toLocaleString("es-CL")}</p>
              <Button className="h-12 w-full" onClick={() => startExecution(r.id)}>
                Iniciar ronda
              </Button>
            </div>
          ))}
          {!rondas.length && <p className="text-xs text-muted-foreground">No hay rondas pendientes.</p>}
        </div>
      )}

      {screen === "ejecucion" && activeExecution && (
        <div className="mx-auto max-w-md space-y-3">
          <p className="text-sm font-medium">{activeExecution.rondaTemplate.name}</p>
          <RondaProgress completed={marksCount + offlineQueue.length} total={activeExecution.checkpointsTotal || activeExecution.rondaTemplate.checkpoints.length} />
          <div className="text-xs text-muted-foreground">
            Batería: {batteryLevel ?? "--"}% · Movimiento: {motionScore.toFixed(1)} · {isOffline ? "Offline" : "Online"}
          </div>
          <QrScanner onScan={(value) => value && void markCheckpoint(value)} />
          <div className="grid grid-cols-1 gap-2">
            <Button className="h-14 w-full text-base font-semibold" onClick={completeExecution}>
              Completar ronda
            </Button>
            <Button className="h-12 w-full" variant="destructive" onClick={() => void panic()}>
              Botón de pánico
            </Button>
          </div>
        </div>
      )}

      {screen === "final" && (
        <div className="mx-auto max-w-md space-y-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-semibold">Ronda finalizada</h2>
          <p className="text-sm text-muted-foreground">
            Estado: {completedInfo?.status} · Trust: {completedInfo?.trustScore}
          </p>
          <Button className="h-12 w-full" onClick={() => window.location.reload()}>
            Volver a mis rondas
          </Button>
        </div>
      )}

      {error && (
        <div className="fixed bottom-3 left-3 right-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
