/**
 * Validación de IP de la Dirección del Trabajo (DT)
 * Rango oficial: 200.72.242.0/27 (200.72.242.0 – 200.72.242.31)
 * Resolución N°38
 */

const DT_NETWORK_BASE = [200, 72, 242, 0];
const DT_NETWORK_MASK = 27;

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3];
}

export function isDtNetwork(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/, "");
  const ipNum = ipToNumber(cleanIp);
  if (ipNum === null) return false;

  const baseNum =
    (DT_NETWORK_BASE[0] << 24) |
    (DT_NETWORK_BASE[1] << 16) |
    (DT_NETWORK_BASE[2] << 8) |
    DT_NETWORK_BASE[3];
  const mask = (~0 << (32 - DT_NETWORK_MASK)) >>> 0;

  return (ipNum & mask) === (baseNum & mask);
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
