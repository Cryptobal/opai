/**
 * Normaliza un PEM de cuenta de servicio pegado en Vercel/dotenv.
 * Compartido por Drive SA e Indexing API (ATS).
 */
export function normalisePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if (key.charCodeAt(0) === 0xfeff) key = key.slice(1);
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) key = decoded;
    } catch {
      /* ignore */
    }
  }
  return key;
}
