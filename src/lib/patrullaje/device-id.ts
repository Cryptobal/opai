function safe(fn: () => unknown, fallback: unknown = "unknown"): unknown {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

export function generateDeviceId(): string {
  const raw = [
    safe(() => navigator.userAgent),
    safe(() => screen.width, 0),
    safe(() => screen.height, 0),
    safe(() => screen.colorDepth, 0),
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    safe(() => navigator.language),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `dev_${Math.abs(hash).toString(36)}`;
}

export function getShortDeviceId(deviceId: string): string {
  return deviceId.slice(0, 10);
}
