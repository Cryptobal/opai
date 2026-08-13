import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function ipv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function ipIsPrivate(ip: string): boolean {
  const v4 = ipv4Octets(ip);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) {
    return true;
  }
  if (v6.startsWith("::ffff:")) return ipIsPrivate(v6.slice(7));
  return false;
}

export function parseRemoteImageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return null;
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return null;
  }
  if (host.includes("%") || host.includes("[")) {
    // IPv6 literal: comprobar el interior.
    const inner = host.startsWith("[") ? host.slice(1, -1) : host;
    if (isIP(inner) && ipIsPrivate(inner)) return null;
  }
  if (isIP(host) && ipIsPrivate(host)) return null;
  return url;
}

export async function assertSafeRemoteImageHost(url: URL): Promise<boolean> {
  const host = url.hostname.replace(/\.$/, "");
  if (isIP(host)) return !ipIsPrivate(host);
  try {
    const results = await lookup(host, { all: true, verbatim: true });
    if (!results.length) return false;
    return results.every((r) => !ipIsPrivate(r.address));
  } catch {
    return false;
  }
}
