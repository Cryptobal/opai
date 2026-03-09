"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { PairingScreen } from "./PairingScreen";
import { PairingSuccess } from "./PairingSuccess";
import { GuardSelector } from "./GuardSelector";
import { StandbyScreen } from "./StandbyScreen";
import { BottomTabBar } from "./BottomTabBar";
import { InstallationHeader } from "./InstallationHeader";
import { OfflineBanner } from "./OfflineBanner";
import InicioTab from "./tabs/InicioTab";
import RegistroTab from "./tabs/RegistroTab";
import EnSitioTab from "./tabs/EnSitioTab";
import MasTab from "./tabs/MasTab";
import type { AccessControlConfigData } from "@/lib/access-control/types";
import { DEVICE_TOKEN_KEY, LEGACY_ACCESS_TOKEN_KEY, safeStorage } from "@/lib/device-constants";
import { useDeviceHeartbeat } from "@/hooks/useDeviceHeartbeat";
import { LogoutPinModal } from "@/components/portal/LogoutPinModal";

export type TabId = "inicio" | "registro" | "en-sitio" | "mas";
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface DeviceInfo {
  deviceToken: string;
  deviceId?: string;
  installationId: string;
  installationName: string;
  installationAddress: string;
  currentGuardId?: string | null;
  guardName?: string | null;
  guardSelectedAt?: string | null;
  pairedAt?: string;
}

type AppState =
  | "loading"
  | "pairing"
  | "pairing-success"
  | "guard-select"
  | "active"
  | "standby"
  | "preview";

export function AccessPortalApp() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [config, setConfig] = useState<AccessControlConfigData | null>(null);
  const [pairingData, setPairingData] = useState<{
    installationName: string;
    installationAddress: string;
  } | null>(null);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ── Check for admin preview mode ────────────────────────────────────
  const isPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "true";
  const previewInstallationId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("installation")
      : null;

  // ── Screen Wake Lock ────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock not supported or denied
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  // ── Inactivity tracking ─────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      setAppState((prev) => (prev === "active" ? "standby" : prev));
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (appState !== "active") return;

    const events = ["touchstart", "mousedown", "keydown", "scroll"];
    const handler = () => resetInactivityTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [appState, resetInactivityTimer]);

  // Wake lock: active when not in standby
  useEffect(() => {
    if (appState === "active") {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    return () => releaseWakeLock();
  }, [appState, requestWakeLock, releaseWakeLock]);

  // ── Heartbeat (works for tokens in unified DevicePairing table) ────
  useDeviceHeartbeat();

  // ── Initialize: check for stored device token ──────────────────────
  useEffect(() => {
    async function init() {
      // Migrate legacy localStorage key to unified key
      const legacyToken = safeStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
      const currentToken = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (legacyToken && !currentToken) {
        safeStorage.setItem(DEVICE_TOKEN_KEY, legacyToken);
        safeStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
      }

      // Admin preview mode
      if (isPreview && previewInstallationId) {
        try {
          const res = await fetch(
            `/api/access-control/preview/${previewInstallationId}`
          );
          const json = await res.json();
          if (json.success) {
            setDevice({
              deviceToken: "",
              installationId: json.data.installationId,
              installationName: json.data.installationName,
              installationAddress: json.data.installationAddress ?? "",
            });
            setAppState("preview");
            return;
          }
        } catch {
          // Fall through to normal flow
        }
      }

      const storedToken = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (!storedToken) {
        setAppState("pairing");
        return;
      }

      // Validate stored token
      try {
        const res = await fetch("/api/access-control/device/validate", {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const json = await res.json();

        if (json.success && json.data?.valid) {
          const deviceInfo: DeviceInfo = {
            deviceToken: storedToken,
            deviceId: json.data.deviceId,
            installationId: json.data.installationId,
            installationName: json.data.installationName,
            installationAddress: json.data.installationAddress ?? "",
            currentGuardId: json.data.currentGuardId,
            guardSelectedAt: json.data.guardSelectedAt,
            pairedAt: json.data.pairedAt,
          };
          setDevice(deviceInfo);

          // Check if guard needs to be selected (no guard or >12h since selection)
          const needsGuard = shouldSelectGuard(json.data.guardSelectedAt);
          setAppState(needsGuard ? "guard-select" : "active");
        } else {
          // Token invalid — clear and show pairing
          safeStorage.removeItem(DEVICE_TOKEN_KEY);
          setAppState("pairing");
        }
      } catch {
        // Network error — try to work offline if we have a token
        setDevice({
          deviceToken: storedToken,
          installationId: "",
          installationName: "",
          installationAddress: "",
        });
        setAppState("pairing");
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch config when device is set ────────────────────────────────
  useEffect(() => {
    if (!device?.installationId) return;

    async function fetchConfig() {
      try {
        const headers: Record<string, string> = {};
        if (device!.deviceToken) {
          headers.Authorization = `Bearer ${device!.deviceToken}`;
        }
        const res = await fetch(
          `/api/access-control/config/${device!.installationId}`,
          { headers }
        );
        const json = await res.json();
        if (json.success) setConfig(json.data);
      } catch {
        // Will use default config
      }
    }
    fetchConfig();
  }, [device]);

  // ── Online/offline detection ───────────────────────────────────────
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Pending offline records count ──────────────────────────────────
  useEffect(() => {
    async function countPending() {
      try {
        const dbs = await indexedDB.databases();
        const accesoDB = dbs.find((db) => db.name === "acceso_offline");
        if (!accesoDB) {
          setPendingCount(0);
          return;
        }
        const request = indexedDB.open("acceso_offline", 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("pending_records")) {
            setPendingCount(0);
            db.close();
            return;
          }
          const tx = db.transaction("pending_records", "readonly");
          const store = tx.objectStore("pending_records");
          const countReq = store.count();
          countReq.onsuccess = () => {
            setPendingCount(countReq.result);
            db.close();
          };
          countReq.onerror = () => {
            setPendingCount(0);
            db.close();
          };
        };
        request.onerror = () => setPendingCount(0);
      } catch {
        setPendingCount(0);
      }
    }

    countPending();
    const interval = setInterval(countPending, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────

  const handlePaired = useCallback(
    (data: {
      deviceToken: string;
      installationId: string;
      installationName: string;
      installationAddress: string;
    }) => {
      safeStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
      setDevice({
        deviceToken: data.deviceToken,
        installationId: data.installationId,
        installationName: data.installationName,
        installationAddress: data.installationAddress ?? "",
      });
      setPairingData({
        installationName: data.installationName,
        installationAddress: data.installationAddress ?? "",
      });
      setAppState("pairing-success");
    },
    []
  );

  const handlePairingContinue = useCallback(() => {
    setAppState("guard-select");
  }, []);

  const handleGuardSelected = useCallback(
    (guard: { id: string; name: string }) => {
      setDevice((prev) =>
        prev
          ? {
              ...prev,
              currentGuardId: guard.id,
              guardName: guard.name,
              guardSelectedAt: new Date().toISOString(),
            }
          : prev
      );
      setAppState("active");
    },
    []
  );

  const handleGuardSkip = useCallback(() => {
    setAppState("active");
  }, []);

  const handleChangeGuard = useCallback(() => {
    setAppState("guard-select");
  }, []);

  const handleWake = useCallback((needsGuardSelect: boolean) => {
    if (needsGuardSelect) {
      setAppState("guard-select");
    } else {
      setAppState("active");
    }
  }, []);

  // ── Logout with PIN ─────────────────────────────────────────────────
  const [showLogoutPin, setShowLogoutPin] = useState(false);

  const handleLogoutRequest = useCallback(() => {
    setShowLogoutPin(true);
  }, []);

  const doLogout = useCallback(() => {
    safeStorage.removeItem(DEVICE_TOKEN_KEY);
    setDevice(null);
    setConfig(null);
    setAppState("pairing");
  }, []);

  // ── Renders ────────────────────────────────────────────────────────

  if (appState === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0A0F1C]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <p className="text-sm text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  if (appState === "pairing") {
    return <PairingScreen onPaired={handlePaired} />;
  }

  if (appState === "pairing-success" && pairingData) {
    return (
      <PairingSuccess
        installationName={pairingData.installationName}
        installationAddress={pairingData.installationAddress}
        onContinue={handlePairingContinue}
      />
    );
  }

  if (appState === "guard-select" && device) {
    return (
      <GuardSelector
        installationName={device.installationName}
        deviceToken={device.deviceToken}
        onGuardSelected={handleGuardSelected}
        onSkip={handleGuardSkip}
      />
    );
  }

  if (appState === "standby" && device) {
    return (
      <StandbyScreen
        installationId={device.installationId}
        installationName={device.installationName}
        deviceToken={device.deviceToken}
        onWake={handleWake}
        guardSelectedAt={device.guardSelectedAt ?? null}
      />
    );
  }

  if (!device) return null;

  const guardId = device.currentGuardId ?? "";
  const guardName = device.guardName ?? "Guardia";

  // Main app with tabs (active or preview mode)
  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0F1C]">
      <InstallationHeader
        installationName={device.installationName}
        guardName={guardName}
        isOnline={isOnline}
        isPreview={appState === "preview"}
        onChangeGuard={handleChangeGuard}
      />

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-2">
        {activeTab === "inicio" && (
          <InicioTab
            installationId={device.installationId}
            installationName={device.installationName}
            guardName={guardName}
          />
        )}
        {activeTab === "registro" && config && (
          <RegistroTab
            installationId={device.installationId}
            guardId={guardId}
            tenantId=""
            config={config}
            onEntryRegistered={() => {}}
          />
        )}
        {activeTab === "en-sitio" && (
          <EnSitioTab
            installationId={device.installationId}
            guardId={guardId}
            maxStayHours={config?.maxStayHours}
          />
        )}
        {activeTab === "mas" && (
          <MasTab
            installationId={device.installationId}
            guardId={guardId}
            guardName={guardName}
            installationName={device.installationName}
            deviceToken={device.deviceToken}
            pairedAt={device.pairedAt}
            onChangeGuard={handleChangeGuard}
            onLogout={handleLogoutRequest}
          />
        )}
      </main>

      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} />

      <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* FAB for quick entry */}
      {(activeTab === "inicio" || activeTab === "registro") && (
        <button
          type="button"
          onClick={() => setActiveTab("registro")}
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition-transform active:scale-95"
          aria-label="Registro rápido"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      <LogoutPinModal
        open={showLogoutPin}
        deviceToken={device.deviceToken}
        onConfirm={() => { setShowLogoutPin(false); doLogout(); }}
        onCancel={() => setShowLogoutPin(false)}
      />
    </div>
  );
}

/** Returns true if guard selection is needed (no guard or >12h since last selection) */
function shouldSelectGuard(
  guardSelectedAt: string | null | undefined
): boolean {
  if (!guardSelectedAt) return true;
  const selectedTime = new Date(guardSelectedAt).getTime();
  const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
  return selectedTime < twelveHoursAgo;
}
