/**
 * Descarga o comparte un archivo de forma fiable en móvil.
 *
 * En iOS/Android, `window.open(blob:)` y el atributo `download` suelen fallar
 * o no permiten reenviar por WhatsApp. Preferimos Web Share API con `File` y,
 * si no está disponible, caemos a `<a download>` sobre un object URL.
 */

export type DownloadOrShareInput = {
  /** URL same-origin (API autenticada por cookie) o object URL. */
  url: string;
  filename: string;
  mimeType?: string;
  /**
   * Si true (default), intenta `navigator.share({ files })` cuando el dispositivo
   * lo soporta. En desktop sin share, descarga directo.
   */
  preferShare?: boolean;
};

export type DownloadOrShareResult =
  | { method: "share" }
  | { method: "download" };

function triggerAnchorDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadOrShareFile(
  input: DownloadOrShareInput,
): Promise<DownloadOrShareResult> {
  const preferShare = input.preferShare !== false;
  const res = await fetch(input.url);
  if (!res.ok) {
    let message = `Error al descargar (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // ignore non-JSON errors
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const type = input.mimeType || blob.type || "application/octet-stream";
  const file = new File([blob], input.filename, { type });

  if (
    preferShare &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: input.filename });
      return { method: "share" };
    } catch (err) {
      // Usuario canceló el sheet → no forzar descarga.
      if (err instanceof DOMException && err.name === "AbortError") {
        return { method: "share" };
      }
      // Share falló por otro motivo → fallback descarga.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerAnchorDownload(objectUrl, input.filename);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
  return { method: "download" };
}
