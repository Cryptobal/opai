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
          const json = await res.json();
          const data = json.data ?? json; // handle both { data: {...} } and flat response
          if (data.portalMarcacionEnabled === false || !data.installationId) {
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
      <div
        className="min-h-dvh flex flex-col items-center justify-center"
        style={{ background: "#0f172a" }}
      >
        <div
          className="w-[56px] h-[56px] rounded-[16px] flex items-center justify-center mb-5"
          style={{
            background: "linear-gradient(135deg, #f43f5e, #e11d48, #be123c)",
            boxShadow: "0 0 40px rgba(244,63,94,0.2)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </div>
        <div className="w-6 h-6 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
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
