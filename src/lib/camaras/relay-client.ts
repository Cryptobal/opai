const TIMEOUT_MS = 8000;

function relayConfig(): { url: string; token: string } {
  const url = process.env.MEDIA_RELAY_URL?.replace(/\/$/, "");
  const token = process.env.MEDIA_RELAY_ADMIN_TOKEN;
  if (!url || !token?.trim()) {
    throw new Error("Relay de media no configurado (MEDIA_RELAY_URL / MEDIA_RELAY_ADMIN_TOKEN).");
  }
  return { url, token };
}

async function relayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, token } = relayConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "X-Relay-Admin": token,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function upsertStream(name: string, src: string): Promise<void> {
  const params = new URLSearchParams({ name, src });
  const res = await relayFetch(`/api/streams?${params.toString()}`, { method: "PUT" });
  if (!res.ok) {
    throw new Error(`Relay rechazó el stream (${res.status})`);
  }
}

export async function removeStream(name: string): Promise<void> {
  const params = new URLSearchParams({ src: name });
  const res = await relayFetch(`/api/streams?${params.toString()}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Relay no pudo eliminar el stream (${res.status})`);
  }
}

export async function fetchSnapshot(name: string): Promise<Buffer> {
  const params = new URLSearchParams({ src: name });
  const res = await relayFetch(`/api/frame.jpeg?${params.toString()}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`No se pudo obtener snapshot (${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 32) {
    throw new Error("Snapshot vacío o inválido");
  }
  return bytes;
}

export function isRelayConfigured(): boolean {
  return Boolean(process.env.MEDIA_RELAY_URL?.trim() && process.env.MEDIA_RELAY_ADMIN_TOKEN?.trim());
}

export function publicRelayUrl(): string {
  const url = (process.env.NEXT_PUBLIC_MEDIA_RELAY_URL || process.env.MEDIA_RELAY_URL || "")
    .replace(/\/$/, "");
  return url;
}
