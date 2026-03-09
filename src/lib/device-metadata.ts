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
}

export async function collectDeviceMetadata(): Promise<DeviceMetadata> {
  const base: DeviceMetadata = {
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio,
    cpuCores: navigator.hardwareConcurrency ?? null,
    ramGB: (navigator as any).deviceMemory ?? null,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    latitude: null,
    longitude: null,
    gpsAccuracy: null,
    batteryLevel: null,
    batteryCharging: null,
    connectionType: null,
    connectionDownlink: null,
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
