/**
 * Datos estructurados de firma de correo (puro: sin Prisma ni React).
 * content Json de CrmEmailSignature con kind:"structured" → este tipo.
 * Cualquier otro shape es legacy (Tiptap) y se envía vía htmlContent tal cual.
 */

export type SignatureLayout = "logo-left" | "logo-top" | "text-only";

export type SignatureData = {
  kind: "structured";
  v: 1;
  fullName: string;
  role?: string;
  company?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: string;
  logoUrl?: string;
  logoStorageKey?: string;
  logoWidthPx?: number;
  layout: SignatureLayout;
  accentColor?: string;
  disclaimer?: string;
};

export const DEFAULT_ACCENT = "#0f8f74";
export const DEFAULT_LOGO_WIDTH = 120;
export const MIN_LOGO_WIDTH = 40;
export const MAX_LOGO_WIDTH = 240;

const LAYOUTS: ReadonlySet<string> = new Set([
  "logo-left",
  "logo-top",
  "text-only",
]);

const MAX_NAME = 80;
const MAX_ROLE = 80;
const MAX_COMPANY = 80;
const MAX_PHONE = 40;
const MAX_EMAIL = 120;
const MAX_WEBSITE = 200;
const MAX_ADDRESS = 160;
const MAX_DISCLAIMER = 300;
const MAX_STORAGE_KEY = 500;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function asTrimmedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim().slice(0, max);
  return t.length > 0 ? t : undefined;
}

function clampLogoWidth(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LOGO_WIDTH;
  return Math.min(MAX_LOGO_WIDTH, Math.max(MIN_LOGO_WIDTH, Math.round(n)));
}

function parseAccent(value: unknown): string {
  if (typeof value === "string" && HEX_COLOR.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_ACCENT;
}

function parseLayout(value: unknown): SignatureLayout {
  const s = String(value ?? "");
  return LAYOUTS.has(s) ? (s as SignatureLayout) : "logo-left";
}

/**
 * Valida / normaliza un payload desconocido a SignatureData.
 * Nunca lanza. Descarta logoUrl que no cuelgue de r2PublicUrl.
 */
export function parseSignatureData(
  value: unknown,
  r2PublicUrl?: string | null,
): SignatureData {
  const src =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const fullName =
    asTrimmedString(src.fullName, MAX_NAME) ??
    asTrimmedString(src.name, MAX_NAME) ??
    "";

  const role = asTrimmedString(src.role, MAX_ROLE);
  const company = asTrimmedString(src.company, MAX_COMPANY);
  const phone = asTrimmedString(src.phone, MAX_PHONE);
  const whatsapp = asTrimmedString(src.whatsapp, MAX_PHONE);
  const email = asTrimmedString(src.email, MAX_EMAIL);
  const website = asTrimmedString(src.website, MAX_WEBSITE);
  const address = asTrimmedString(src.address, MAX_ADDRESS);
  const disclaimer = asTrimmedString(src.disclaimer, MAX_DISCLAIMER);
  const logoStorageKey = asTrimmedString(src.logoStorageKey, MAX_STORAGE_KEY);
  const layout = parseLayout(src.layout);
  const accentColor = parseAccent(src.accentColor);
  const logoWidthPx = clampLogoWidth(src.logoWidthPx);

  let logoUrl = asTrimmedString(src.logoUrl, 2000);
  const base = (r2PublicUrl ?? "").trim().replace(/\/$/, "");
  if (logoUrl && base) {
    if (!logoUrl.startsWith(base + "/") && logoUrl !== base) {
      logoUrl = undefined;
    }
  } else if (logoUrl && !base) {
    // Sin R2_PUBLIC_URL no persistimos URLs externas ni vacías.
    logoUrl = undefined;
  }

  return {
    kind: "structured",
    v: 1,
    fullName,
    ...(role ? { role } : {}),
    ...(company ? { company } : {}),
    ...(phone ? { phone } : {}),
    ...(whatsapp ? { whatsapp } : {}),
    ...(email ? { email } : {}),
    ...(website ? { website } : {}),
    ...(address ? { address } : {}),
    ...(logoUrl ? { logoUrl } : {}),
    ...(logoStorageKey ? { logoStorageKey } : {}),
    logoWidthPx,
    layout,
    accentColor,
    ...(disclaimer ? { disclaimer } : {}),
  };
}

/** True si el content Json es una firma estructurada v1. */
export function isStructuredSignature(value: unknown): value is SignatureData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.kind === "structured" && v.v === 1;
}

/**
 * Normaliza teléfono chileno a E.164 (+56…) o null si no se puede.
 * - 9 dígitos → +56 + dígitos
 * - 11 dígitos empezando en 56 → + + dígitos
 * - Otro largo → null (se renderiza como texto sin enlace)
 */
export function normalizeChilePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("56")) return `+${digits}`;
  return null;
}

/** Dígitos para wa.me (sin +). null si no hay dígitos útiles. */
export function normalizeWhatsAppDigits(raw: string): string | null {
  const e164 = normalizeChilePhone(raw);
  if (e164) return e164.replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** href web: agrega https:// si falta protocolo. */
export function normalizeWebsiteHref(raw: string): string {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** Etiqueta visible de web sin protocolo. */
export function websiteLabel(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "");
}
