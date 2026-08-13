import { NextRequest, NextResponse } from "next/server";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  assertSafeRemoteImageHost,
  parseRemoteImageUrl,
} from "@/lib/email-remote-image-ssrf";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_MS = 10_000;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function contentTypeOk(raw: string | null): string | null {
  if (!raw) return null;
  const mime = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/svg+xml" || mime.includes("svg")) return null;
  if (ALLOWED_TYPES.has(mime)) return mime;
  if (mime === "application/octet-stream") return "application/octet-stream";
  return null;
}

function looksLikeImage(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  // WEBP (RIFF....WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) return true;
  // ICO
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return true;
  return false;
}

async function fetchImageHop(url: URL): Promise<Response> {
  return fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(FETCH_MS),
  });
}

/**
 * Proxy de imágenes remotas del lector de Correos. Equivale al proxy de Gmail:
 * el iframe no pide el CDN del remitente (hotlink / referrer) y no ejecutamos SVG.
 */
export async function GET(req: NextRequest) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;

  const rl = checkRateLimit(`email-img:${mod.ctx.userId}`, {
    limit: 80,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas imágenes" }, { status: 429 });
  }

  const raw = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  let current = parseRemoteImageUrl(raw);
  if (!current) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const safe = await assertSafeRemoteImageHost(current);
      if (!safe) {
        return NextResponse.json({ error: "Host no permitido" }, { status: 400 });
      }
      const res = await fetchImageHop(current);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop === MAX_REDIRECTS) {
          return NextResponse.json({ error: "Redirect inválido" }, { status: 400 });
        }
        const next = parseRemoteImageUrl(new URL(loc, current).toString());
        if (!next) {
          return NextResponse.json({ error: "Redirect inválido" }, { status: 400 });
        }
        current = next;
        continue;
      }
      if (!res.ok) {
        return NextResponse.json({ error: "No se pudo cargar" }, { status: 502 });
      }
      const declared = contentTypeOk(res.headers.get("content-type"));
      if (!declared) {
        return NextResponse.json({ error: "Tipo no permitido" }, { status: 415 });
      }
      const len = Number(res.headers.get("content-length"));
      if (Number.isFinite(len) && len > MAX_BYTES) {
        return NextResponse.json({ error: "Imagen demasiado grande" }, { status: 413 });
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        return NextResponse.json({ error: "Imagen demasiado grande" }, { status: 413 });
      }
      if (declared === "application/octet-stream" && !looksLikeImage(buf)) {
        return NextResponse.json({ error: "Tipo no permitido" }, { status: 415 });
      }
      const mime = declared === "application/octet-stream" ? "image/jpeg" : declared;
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      });
    }
    return NextResponse.json({ error: "Redirect inválido" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 502 });
  }
}
