export function generateDeviceId(): string {
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
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
