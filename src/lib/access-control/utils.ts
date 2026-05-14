/**
 * Access Control Module — Utility Functions
 *
 * RUT validation (módulo 11), Chilean plate validation,
 * QR cédula parsing, formatting helpers.
 */

import type { CedulaQRData, ParsedMRZ, PlateFormat } from "./types";

// ═══════════════════════════════════════════════════════════════
//  RUT VALIDATION (Módulo 11)
// ═══════════════════════════════════════════════════════════════

/**
 * Cleans a RUT string removing dots, dashes, and spaces.
 * Returns uppercase string with body + dv concatenated.
 */
export function cleanRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

/**
 * Validates a Chilean RUT using the módulo 11 algorithm.
 * Accepts formats: "12345678-9", "12.345.678-9", "123456789"
 */
export function validateRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 7 || clean.length > 9) return false;

  const body = clean.slice(0, -1);
  const providedDv = clean.slice(-1);

  if (!/^\d+$/.test(body)) return false;

  const computedDv = computeRutDv(body);
  return computedDv === providedDv;
}

/**
 * Computes the verification digit (dígito verificador) for a RUT body.
 */
export function computeRutDv(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

/**
 * Formats a RUT string: "12.345.678-9"
 */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

/**
 * Formats a RUT for display with dash only (no dots): "12345678-9"
 */
export function formatRutDash(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

// ═══════════════════════════════════════════════════════════════
//  CHILEAN PLATE VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Normaliza una patente para almacenarla / compararla. Elimina espacios y
 * guiones, convierte a mayúsculas. No valida el formato — usar validateChileanPlate.
 */
export function cleanPlate(plate: string): string {
  return plate.replace(/[-\s]/g, "").toUpperCase();
}

/**
 * Validates and classifies a Chilean license plate.
 */
export function validateChileanPlate(plate: string): { valid: boolean; format: PlateFormat } {
  const clean = plate.replace(/[-\s]/g, "").toUpperCase();

  // Old format: BB-9999 (2 letters + 4 digits)
  if (/^[A-Z]{2}\d{4}$/.test(clean)) return { valid: true, format: "old" };
  // New format: BBBB-99 (4 letters + 2 digits)
  if (/^[A-Z]{4}\d{2}$/.test(clean)) return { valid: true, format: "new" };
  // Moto format: BB-999 (2 letters + 3 digits)
  if (/^[A-Z]{2}\d{3}$/.test(clean)) return { valid: true, format: "moto" };

  return { valid: false, format: "unknown" };
}

/**
 * Formats a Chilean license plate with dash separator.
 */
export function formatChileanPlate(plate: string): string {
  const clean = plate.replace(/[-\s]/g, "").toUpperCase();

  if (/^[A-Z]{2}\d{4}$/.test(clean)) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  if (/^[A-Z]{4}\d{2}$/.test(clean)) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  if (/^[A-Z]{2}\d{3}$/.test(clean)) return `${clean.slice(0, 2)}-${clean.slice(2)}`;

  return clean;
}

// ═══════════════════════════════════════════════════════════════
//  QR CÉDULA CHILENA PARSER
// ═══════════════════════════════════════════════════════════════

const QR_PATTERNS = [
  { regex: /portal\.sidiv\.registrocivil\.cl\/docstatus/, source: "cedula_2013" as const },
  { regex: /portal\.nuevosidiv\.registrocivil\.cl\/document-validity/, source: "cedula_2024" as const },
];

/**
 * Converts an uppercase MRZ name string to Title Case.
 */
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parses a TD1 MRZ string (90 chars, 3 lines of 30) to extract personal data.
 * Returns null if the MRZ is malformed or the name cannot be extracted.
 */
export function parseMRZ(mrz: string): ParsedMRZ | null {
  const clean = mrz.replace(/[\n\r]/g, "");
  if (clean.length !== 90) return null;

  const line1 = clean.substring(0, 30);
  const line2 = clean.substring(30, 60);
  const line3 = clean.substring(60, 90);

  // Line 3: name — SURNAME<<GIVEN<NAMES<<<...
  const nameParts = line3.split("<<");
  const surname = nameParts[0].replace(/</g, " ").trim();
  const givenNames = nameParts.slice(1).join(" ").replace(/</g, " ").trim();

  if (!surname) return null;

  const fullName = givenNames
    ? toTitleCase(`${givenNames} ${surname}`)
    : toTitleCase(surname);

  // Line 1: document number at positions 5-13
  const documentNumber = line1.substring(5, 14).replace(/</g, "").trim() || undefined;

  // Line 2: DOB [0-5], sex [7], expiry [8-13], nationality [15-17]
  const dateOfBirth = line2.substring(0, 6).replace(/</g, "") || undefined;
  const sex = line2.substring(7, 8).replace(/</g, "") || undefined;
  const expiryDate = line2.substring(8, 14).replace(/</g, "") || undefined;
  const nationality = line2.substring(15, 18).replace(/</g, "").trim() || undefined;

  return {
    surname: toTitleCase(surname),
    givenNames: toTitleCase(givenNames),
    fullName,
    documentNumber,
    dateOfBirth,
    sex,
    expiryDate,
    nationality,
  };
}

/**
 * Parses a QR code from a Chilean cédula de identidad.
 * Returns structured data or null if not a valid cédula QR.
 */
export function parseCedulaQR(qrContent: string): CedulaQRData | null {
  const trimmed = qrContent.trim();

  // Determine source based on URL pattern
  let source: CedulaQRData["source"] | null = null;
  for (const p of QR_PATTERNS) {
    if (p.regex.test(trimmed)) {
      source = p.source;
      break;
    }
  }

  if (!source) return null;

  try {
    const url = new URL(trimmed);
    const run = url.searchParams.get("RUN") || url.searchParams.get("run");
    const serial = url.searchParams.get("serial");
    const type = url.searchParams.get("type") || "CEDULA";
    const mrz = url.searchParams.get("mrz") || undefined;

    if (!run || !serial) return null;

    // Validate the RUT
    if (!validateRut(run)) return null;

    // If MRZ present and no explicit source yet, mark as 2024
    if (mrz && source === "cedula_2013") {
      source = "cedula_2024";
    }

    const parsedMrz = mrz ? parseMRZ(mrz) : undefined;

    return {
      rut: formatRutDash(run),
      serial,
      mrz,
      parsedMrz: parsedMrz ?? undefined,
      type,
      source,
      validationUrl: trimmed,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  TIME / DURATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Formats a duration in minutes to a human-readable string: "2h 30m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return "< 1m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Computes elapsed minutes between two timestamps.
 */
export function elapsedMinutes(from: string | Date, to?: string | Date): number {
  const fromDate = typeof from === "string" ? new Date(from) : from;
  const toDate = to ? (typeof to === "string" ? new Date(to) : to) : new Date();
  return Math.max(0, (toDate.getTime() - fromDate.getTime()) / 60000);
}

/**
 * Returns a color class based on stay duration and max hours.
 */
export function stayDurationColor(minutes: number, maxStayHours?: number | null): "green" | "yellow" | "red" {
  const hours = minutes / 60;
  if (maxStayHours && hours > maxStayHours) return "red";
  if (hours > 8) return "red";
  if (hours > 4) return "yellow";
  return "green";
}

/**
 * Checks if the current time is within the allowed schedule of a whitelist entry.
 */
export function isWithinSchedule(
  allowedDays: number[],
  allowedTimeFrom?: string | null,
  allowedTimeTo?: string | null,
): boolean {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sunday

  // Check day
  if (allowedDays.length > 0 && !allowedDays.includes(currentDay)) {
    return false;
  }

  // Check time
  if (allowedTimeFrom && allowedTimeTo) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [fromH, fromM] = allowedTimeFrom.split(":").map(Number);
    const [toH, toM] = allowedTimeTo.split(":").map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;

    if (nowMinutes < fromMinutes || nowMinutes > toMinutes) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a date is within a validity range.
 */
export function isWithinValidity(
  validFrom?: string | Date | null,
  validUntil?: string | Date | null,
): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (validFrom) {
    const from = new Date(validFrom);
    from.setHours(0, 0, 0, 0);
    if (now < from) return false;
  }

  if (validUntil) {
    const until = new Date(validUntil);
    until.setHours(23, 59, 59, 999);
    if (now > until) return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
//  OCR PLATE PROMPT
// ═══════════════════════════════════════════════════════════════

export const OCR_MRZ_PROMPT = `Analiza esta imagen del reverso de una cédula de identidad chilena.
Lee las 3 líneas MRZ (Machine Readable Zone) impresas en la parte inferior.
Son texto monoespaciado OCR-B, 3 líneas de 30 caracteres cada una, usando letras, números y el carácter "<".

Línea 3 contiene: APELLIDOS<<NOMBRES (separados por <<, espacios internos con <).
Línea 2 contiene después de "CHL": el RUT sin puntos ni guión seguido de <digito_verificador.

Extrae el nombre completo y el RUT.

Responde SOLO con un JSON:
{"fullName": "Nombres Apellidos", "rut": "12345678-9", "mrz_line1": "...", "mrz_line2": "...", "mrz_line3": "...", "confidence": 0.95}
Si no puedes leer el MRZ, responde: {"fullName": null, "rut": null, "confidence": 0, "error": "descripción"}`;

export const OCR_PLATE_PROMPT = `Analiza esta imagen de una patente de vehículo chilena. Extrae el texto de la patente.
Las patentes chilenas tienen estos formatos:
- Formato antiguo: BB-9999 o BB9999 (2 letras + 4 números)
- Formato nuevo: BBBB-99 o BBBB99 (4 letras + 2 números)
- Formato motos: BB-999 (2 letras + 3 números)

Responde SOLO con un JSON: {"plate": "XXXX-XX", "confidence": 0.95, "format": "new|old|moto"}
Si no puedes leer la patente, responde: {"plate": null, "confidence": 0, "error": "descripción del problema"}`;
