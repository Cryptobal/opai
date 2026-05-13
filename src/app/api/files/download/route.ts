import { NextRequest, NextResponse } from "next/server";
import {
  extractStorageKeyFromPublicUrl,
  getPresignedDownloadUrl,
} from "@/lib/storage";

/**
 * Proxy de descarga: recibe un URL público de R2 y redirige a un URL
 * firmado con `Content-Disposition: attachment`, forzando que el browser
 * descargue el archivo en vez de abrirlo en una pestaña.
 *
 * El URL público (`R2_PUBLIC_URL/<storageKey>`) ya es accesible sin auth,
 * por lo que este endpoint NO añade restricción adicional — sólo cambia
 * el header de la respuesta. Si el URL no pertenece a R2 (legacy/externo),
 * se redirige al original como fallback (no se forzará descarga, pero el
 * link seguirá funcionando).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const name = searchParams.get("name");

  if (!url) {
    return NextResponse.json(
      { success: false, error: "Falta parámetro url" },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { success: false, error: "URL inválido" },
      { status: 400 },
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json(
      { success: false, error: "Protocolo no permitido" },
      { status: 400 },
    );
  }

  const storageKey = extractStorageKeyFromPublicUrl(url);
  if (!storageKey) {
    // URL fuera del bucket R2 conocido: degradación graciosa.
    return NextResponse.redirect(url, 302);
  }

  const ext = storageKey.includes(".")
    ? storageKey.slice(storageKey.lastIndexOf("."))
    : "";
  let fileName = name && name.trim()
    ? name.trim()
    : storageKey.split("/").pop() || "archivo";
  if (ext && !fileName.toLowerCase().endsWith(ext.toLowerCase())) {
    fileName = `${fileName}${ext}`;
  }

  try {
    const signedUrl = await getPresignedDownloadUrl({ storageKey, fileName });
    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    console.error("[FILES] Error generando URL firmado de descarga:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar la descarga" },
      { status: 500 },
    );
  }
}
