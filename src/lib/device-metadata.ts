export interface DeviceMetadata {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  cpuCores: number | null;
  ramGB: number | null;
  language: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  gpsAccuracy: number | null;
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  connectionType: string | null;
  connectionDownlink: number | null;
  isWebView: boolean;
}

function safeGet<T>(fn: () => T, fallback: T): T {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

export async function collectDeviceMetadata(): Promise<DeviceMetadata> {
  const ua = safeGet(() => navigator.userAgent, "unknown");

  const base: DeviceMetadata = {
    userAgent: ua,
    screenWidth: safeGet(() => screen.width, 0),
    screenHeight: safeGet(() => screen.height, 0),
    devicePixelRatio: safeGet(() => window.devicePixelRatio, 1),
    cpuCores: safeGet(() => navigator.hardwareConcurrency, null),
    ramGB: safeGet(() => (navigator as any).deviceMemory, null),
    language: safeGet(() => navigator.language, "unknown"),
    timezone: safeGet(() => Intl.DateTimeFormat().resolvedOptions().timeZone, "unknown"),
    latitude: null,
    longitude: null,
    gpsAccuracy: null,
    batteryLevel: null,
    batteryCharging: null,
    connectionType: null,
    connectionDownlink: null,
    isWebView: safeGet(
      () => /wv|WebView/i.test(navigator.userAgent) || !(window as any).chrome,
      false
    ),
  };

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 10000,
        maximumAge: 60000,
      })
    );
    base.latitude = pos.coords.latitude;
    base.longitude = pos.coords.longitude;
    base.gpsAccuracy = pos.coords.accuracy;
  } catch {}

  try {
    const battery = await (navigator as any).getBattery?.();
    if (battery) {
      base.batteryLevel = battery.level;
      base.batteryCharging = battery.charging;
    }
  } catch {}

  try {
    const conn = (navigator as any).connection;
    if (conn) {
      base.connectionType = conn.effectiveType ?? null;
      base.connectionDownlink = conn.downlink ?? null;
    }
  } catch {}

  return base;
}
