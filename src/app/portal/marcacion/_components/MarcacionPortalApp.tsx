"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MarcacionPairingScreen } from "./MarcacionPairingScreen";
import { MarcacionScreen } from "./MarcacionScreen";
import { DEVICE_TOKEN_KEY, safeStorage } from "@/lib/device-constants";

interface DeviceInfo {
  deviceToken: string;
  installationId: string;
  installationName: string;
  installationAddress: string;
  tenantId?: string;
}

type AppState = "loading" | "pairing" | "active";

export function MarcacionPortalApp() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Screen wake lock to prevent sleep on kiosk devices
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock not supported or denied
      }
    }
  }, []);

  // On mount: check for existing device token
  useEffect(() => {
    async function init() {
      const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (!token) {
        setAppState("pairing");
        return;
      }

      // Validate token
      try {
        const res = await fetch("/api/devices/validate", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.portalMarcacionEnabled === false) {
            setAppState("pairing");
            return;
          }
          setDevice({
            deviceToken: token,
            installationId: data.installationId,
            installationName: data.installationName ?? "",
            installationAddress: "",
            tenantId: data.tenantId,
          });
          setAppState("active");
          requestWakeLock();
        } else {
          safeStorage.removeItem(DEVICE_TOKEN_KEY);
          setAppState("pairing");
        }
      } catch {
        // Offline with existing token — go active with cached data
        const cachedDevice = safeStorage.getItem("gard_marcacion_device");
        if (cachedDevice) {
          try {
            setDevice(JSON.parse(cachedDevice));
            setAppState("active");
            requestWakeLock();
            return;
          } catch { /* fall through */ }
        }
        setAppState("pairing");
      }
    }

    init();
  }, [requestWakeLock]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  function handlePaired(data: {
    deviceToken: string;
    installationId: string;
    installationName: string;
    installationAddress: string;
  }) {
    safeStorage.setItem(DEVICE_TOKEN_KEY, data.deviceToken);
    const deviceInfo: DeviceInfo = { ...data };
    setDevice(deviceInfo);
    safeStorage.setItem("gard_marcacion_device", JSON.stringify(deviceInfo));
    setAppState("active");
    requestWakeLock();
  }

  if (appState === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ background: "#060a13" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
      </div>
    );
  }

  if (appState === "pairing") {
    return <MarcacionPairingScreen onPaired={handlePaired} />;
  }

  if (!device) return null;

  return (
    <MarcacionScreen
      deviceToken={device.deviceToken}
      installationId={device.installationId}
      installationName={device.installationName}
      isOnline={isOnline}
    />
  );
}
