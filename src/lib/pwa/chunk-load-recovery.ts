/**
 * Recuperación ante ChunkLoadError en PWAs (sobre todo iOS standalone).
 *
 * Tras un deploy, el HTML/caché del Service Worker puede seguir apuntando a
 * chunks `/_next/static/chunks/*` que Vercel ya eliminó. El síntoma típico en
 * iPhone es: splash negro → pantalla blanca y la app no arranca.
 *
 * Estrategia: detectar el error una sola vez por sesión, borrar caches del SW
 * y hacer hard-reload para forzar HTML + chunks frescos.
 */

const RELOAD_KEY = "opai.pwa.chunk-reload";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : typeof error === "string"
        ? error
        : "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

async function clearOpaiCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("opai-") || k === "push-context")
        .map((k) => caches.delete(k)),
    );
  } catch {
    // Best-effort: el reload igual ayuda si el HTML fresco llega por red.
  }
}

async function recoverFromStaleChunks(): Promise<void> {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // sessionStorage bloqueado: igual intentamos una recuperación.
  }

  await clearOpaiCaches();

  // Si hay un SW waiting, forzar activación antes del reload.
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  } catch {
    // ignore
  }

  window.location.reload();
}

/** Instala listeners globales. Idempotente. */
export function installChunkLoadRecovery(): () => void {
  if (typeof window === "undefined") return () => {};

  // Tras un reload exitoso, limpiar la marca para futuros deploys.
  try {
    // Si llegamos a ejecutar JS de la app, el reload funcionó.
    const cleared = sessionStorage.getItem(RELOAD_KEY);
    if (cleared === "1") {
      // Mantener la marca unos segundos evita loops si el error se repite al boot.
      window.setTimeout(() => {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          // ignore
        }
      }, 15_000);
    }
  } catch {
    // ignore
  }

  const onError = (event: ErrorEvent) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      event.preventDefault();
      void recoverFromStaleChunks();
    }
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      void recoverFromStaleChunks();
    }
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
