export const DEVICE_TOKEN_KEY = "opai_device_token";
export const LEGACY_DEVICE_TOKEN_KEY = "gard_device_token"; // migration fallback
export const LEGACY_ACCESS_TOKEN_KEY = "gard_access_device_token";
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Safe localStorage wrapper — falls back to sessionStorage, then no-ops.
 * Prevents crashes in restricted WebView/kiosk environments.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Storage completely unavailable — token lives only in memory
      }
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      sessionStorage.removeItem(key);
    } catch {}
  },
};
