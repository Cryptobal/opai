/**
 * Acceso al micrófono para dictado (OPAI Intelligence).
 *
 * Por qué pedimos mic: el botón de dictado del chat IA convierte voz → texto
 * (MediaRecorder → /api/ai/help-chat/transcribe, o Web Speech en desktop).
 *
 * En iOS PWA / Capacitor, Web Speech suele re-promptear en cada `start()`.
 * Preferimos un único getUserMedia por gesto del usuario y confiar en el
 * permiso persistente del origen (no volver a pedir si ya está "granted").
 */

const GRANTED_KEY = "opai-mic-granted";

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

export function isStandaloneOrNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return true;
  } catch {
    // noop
  }
  try {
    // Capacitor inyecta Capacitor en window cuando corre nativo.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (cap?.isNativePlatform?.()) return true;
  } catch {
    // noop
  }
  return false;
}

export function isIOSLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * En iOS (Safari / PWA / Capacitor) Web Speech re-promptea el mic en cada
 * `recognition.start()`. Forzamos MediaRecorder (un solo getUserMedia).
 */
export function shouldForceServerDictation(): boolean {
  return isIOSLike();
}

export function rememberMicGranted(): void {
  try {
    sessionStorage.setItem(GRANTED_KEY, "1");
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // noop
  }
}

export function wasMicGrantedBefore(): boolean {
  try {
    return (
      sessionStorage.getItem(GRANTED_KEY) === "1" ||
      localStorage.getItem(GRANTED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export async function queryMicPermission(): Promise<MicPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return wasMicGrantedBefore() ? "granted" : "unknown";
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (status.state === "granted") {
      rememberMicGranted();
      return "granted";
    }
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return wasMicGrantedBefore() ? "granted" : "unknown";
  }
}

/**
 * Abre el micrófono. Solo debe llamarse desde un gesto del usuario.
 * No hay warm-up en mount: eso re-prompteaba en PWA/iOS.
 */
export async function acquireUserMediaAudio(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia no disponible");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  rememberMicGranted();
  return stream;
}
