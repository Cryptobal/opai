import {
  DEFAULT_ACCENT,
  DEFAULT_LOGO_WIDTH,
  type SignatureData,
  type SignatureLayout,
} from "@/modules/crm/email/signature-data";

export type SignatureRow = {
  id: string;
  name: string;
  content: unknown;
  htmlContent?: string | null;
  isDefault: boolean;
  userId?: string | null;
  createdAt?: string;
};

export const ACCENT_SWATCHES = [
  "#0f8f74",
  "#0ea5e9",
  "#6366f1",
  "#151a23",
  "#b45309",
  "#be123c",
] as const;

export function emptySignatureData(): SignatureData {
  return {
    kind: "structured",
    v: 1,
    fullName: "",
    layout: "logo-left",
    logoWidthPx: DEFAULT_LOGO_WIDTH,
    accentColor: DEFAULT_ACCENT,
  };
}

export function dataFromRow(row: SignatureRow): SignatureData | null {
  const c = row.content;
  if (c && typeof c === "object" && (c as { kind?: string }).kind === "structured") {
    return c as SignatureData;
  }
  return null;
}

export function isLegacyRow(row: SignatureRow): boolean {
  return dataFromRow(row) === null;
}

const GREETING_RE =
  /^(cordialmente|atentamente|saludos(?: cordiales)?|quedo atento|best regards|kind regards|regards|sincerely)[,.]?\s*/i;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToLines(html: string): string[] {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withBreaks)
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function looksLikeContactLine(line: string, email?: string): boolean {
  if (email && line.toLowerCase().includes(email.toLowerCase())) return true;
  if (/^https?:\/\//i.test(line)) return true;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(line)) return true;
  if (/^(tel|whatsapp|wa\.me)\b/i.test(line)) return true;
  // Solo dígitos / separadores de teléfono
  const digits = line.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length / Math.max(line.length, 1) > 0.5) return true;
  return false;
}

/**
 * Inferencia desde HTML legacy para precargar campos editables.
 * Parte por bloques/saltos; no mete todo el texto en un solo fullName.
 */
export function inferFromLegacyHtml(html: string | null | undefined): Partial<SignatureData> {
  if (!html) return {};

  const emailRaw = html.match(/mailto:([^"'>\s]+)/i)?.[1];
  const phoneRaw = html.match(/tel:([^"'>\s]+)/i)?.[1];
  const waRaw = html.match(/wa\.me\/(\+?\d+)/i)?.[1];
  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
  const websiteHref = hrefs.find(
    (h) => !/wa\.me|mailto:|tel:/i.test(h) && !h.includes("maps.google"),
  );

  const email = emailRaw ? decodeURIComponent(emailRaw) : undefined;
  const phone = phoneRaw ? decodeURIComponent(phoneRaw) : undefined;
  const whatsapp = waRaw ? decodeURIComponent(waRaw) : undefined;
  const website = websiteHref
    ? websiteHref.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    : undefined;

  const lines = htmlToLines(html);
  const contentLines = lines.filter((l) => !looksLikeContactLine(l, email));

  let fullName: string | undefined;
  let role: string | undefined;
  let company: string | undefined;

  if (contentLines[0]) {
    let first = contentLines[0].replace(GREETING_RE, "").trim();
    // "Nombre · Cargo" o "Nombre | Cargo"
    const pipeParts = first.split(/\s*[·|]\s*/).map((p) => p.trim()).filter(Boolean);
    if (pipeParts.length >= 2) {
      fullName = pipeParts[0].slice(0, 80);
      role = pipeParts.slice(1).join(" · ").slice(0, 80);
    } else {
      // "Cordialmente, Nombre Apellido Cargo…" — si el saludo venía pegado
      // y quedó una sola línea larga, intentá separar nombre (2–4 tokens) del resto.
      const tokens = first.split(/\s+/);
      if (tokens.length > 4) {
        fullName = tokens.slice(0, 3).join(" ").slice(0, 80);
        role = tokens.slice(3).join(" ").slice(0, 80);
      } else {
        fullName = first.slice(0, 80);
      }
    }
  }

  if (!role && contentLines[1]) {
    role = contentLines[1].slice(0, 80);
  }
  if (contentLines[2]) {
    company = contentLines[2].slice(0, 80);
  }

  // Fallback si no hubo saltos: texto plano colapsado
  if (!fullName) {
    const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      .replace(GREETING_RE, "");
    const head = text.split(/[·|]/)[0]?.trim();
    if (head) fullName = head.slice(0, 80);
  }

  return {
    ...(fullName ? { fullName } : {}),
    ...(role ? { role } : {}),
    ...(company ? { company } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(whatsapp ? { whatsapp } : {}),
    ...(website ? { website } : {}),
  };
}

export type LayoutOption = {
  id: SignatureLayout;
  label: string;
  hint: string;
};

export const LAYOUT_OPTIONS: LayoutOption[] = [
  { id: "logo-left", label: "Logo al lado", hint: "Logo | datos" },
  { id: "logo-top", label: "Logo arriba", hint: "Logo sobre datos" },
  { id: "text-only", label: "Solo texto", hint: "Sin imagen" },
];
