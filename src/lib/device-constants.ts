export const DEVICE_TOKEN_KEY = "opai_device_token";
export const LEGACY_DEVICE_TOKEN_KEY = "gard_device_token"; // migration fallback
export const LEGACY_ACCESS_TOKEN_KEY = "gard_access_device_token";
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Keys that require maximum persistence (auth tokens used by paired devices
// running as iOS Add-to-Home-Screen PWAs). iOS Safari standalone mode is
// known to drop localStorage across cold starts in several scenarios (ITP,
// memory pressure, navigation back into the home-screen icon), but persistent
// cookies set with Max-Age survive in the network layer. We mirror these keys
// to a cookie as a redundant fallback. Cookies have a ~4 KB per-domain limit,
// so we only mirror small critical strings — never serialized JSON payloads.
const PERSISTENT_KEYS: ReadonlySet<string> = new Set([
  DEVICE_TOKEN_KEY,
  LEGACY_DEVICE_TOKEN_KEY,
  LEGACY_ACCESS_TOKEN_KEY,
]);

const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60; // 1 year

function isHttps(): boolean {
  try {
    return (
      typeof window !== "undefined" && window.location.protocol === "https:"
    );
  } catch {
    return false;
  }
}

function readCookie(name: string): string | null {
  try {
    if (typeof document === "undefined") return null;
    const target = encodeURIComponent(name) + "=";
    const parts = document.cookie ? document.cookie.split(";") : [];
    for (const part of parts) {
      const cookie = part.trim();
      if (cookie.startsWith(target)) {
        return decodeURIComponent(cookie.slice(target.length));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  try {
    if (typeof document === "undefined") return;
    const secure = isHttps() ? "; Secure" : "";
    document.cookie =
      encodeURIComponent(name) +
      "=" +
      encodeURIComponent(value) +
      "; Path=/" +
      "; Max-Age=" +
      COOKIE_MAX_AGE_S +
      "; SameSite=Lax" +
      secure;
  } catch {
    // Cookie writes can fail in restricted WebViews — silently degrade.
  }
}

function deleteCookie(name: string): void {
  try {
    if (typeof document === "undefined") return;
    const secure = isHttps() ? "; Secure" : "";
    document.cookie =
      encodeURIComponent(name) +
      "=; Path=/; Max-Age=0; SameSite=Lax" +
      secure;
  } catch {
    // noop
  }
}

/**
 * Safe storage wrapper — falls back across multiple backends, then no-ops.
 *
 * Read order:  localStorage  →  cookie (PERSISTENT_KEYS only)  →  sessionStorage
 * Write order: localStorage  +  cookie (PERSISTENT_KEYS only)  +  sessionStorage fallback
 *
 * The cookie tier is critical for iOS PWAs added to the Home Screen: in
 * standalone display mode, Safari can purge localStorage between cold starts,
 * which logs paired devices out unexpectedly. Cookies persist through that
 * purge, so when the user reopens the PWA, the token is recovered from the
 * cookie and self-healed back into localStorage.
 *
 * Non-persistent keys (e.g. cached JSON sessions) keep the original
 * localStorage→sessionStorage semantics — we don't bloat cookies with them.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      // localStorage unavailable — fall through
    }

    if (PERSISTENT_KEYS.has(key)) {
      const cookieValue = readCookie(key);
      if (cookieValue !== null) {
        // Self-heal: restore into localStorage so subsequent reads are fast
        // and so non-PWA contexts (regular Safari) also see the value.
        try {
          localStorage.setItem(key, cookieValue);
        } catch {
          // ignore
        }
        return cookieValue;
      }
    }

    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    let primaryOk = false;
    try {
      localStorage.setItem(key, value);
      primaryOk = true;
    } catch {
      // localStorage unavailable
    }

    // Mirror auth tokens to a long-lived cookie regardless of localStorage
    // result — the cookie is the durable tier on iOS PWAs.
    if (PERSISTENT_KEYS.has(key)) {
      writeCookie(key, value);
      primaryOk = true;
    }

    if (!primaryOk) {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Storage completely unavailable — value lives only in memory.
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
    if (PERSISTENT_KEYS.has(key)) {
      deleteCookie(key);
    }
  },
};
