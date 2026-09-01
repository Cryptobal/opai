/**
 * Formatos del comprobante de marcación (Res. Exenta N°38 Art. 13).
 * Fecha dd/mm/aa y hora hh:mm:ss en America/Santiago, 24 h.
 */

import { formatRut } from "@/lib/chile-rut";
import { CHILE_TZ } from "@/lib/dates-cl";

const TZ = { timeZone: CHILE_TZ as string };

export function formatFechaComprobante(timestamp: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    ...TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(timestamp);
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const year = parts.find((p) => p.type === "year")?.value ?? "00";
  return `${day}/${month}/${year}`;
}

export function formatHoraComprobante(timestamp: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    ...TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(timestamp);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${hour}:${minute}:${second}`;
}

export function formatRutComprobante(rut: string | null | undefined): string {
  if (!rut || !rut.trim()) return "—";
  return formatRut(rut);
}

export function formatEstablishmentAddress(parts: {
  address?: string | null;
  commune?: string | null;
  city?: string | null;
  region?: string | null;
}): string {
  const chunks = [parts.address, parts.commune, parts.city, parts.region]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  return chunks.join(", ");
}

export function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidPersonalEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normalizePersonalEmail(value: string): string {
  return value.trim().toLowerCase();
}
