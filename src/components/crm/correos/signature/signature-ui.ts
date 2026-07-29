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

/** Inferencia mínima desde HTML legacy para precargar "Convertir a campos". */
export function inferFromLegacyHtml(html: string | null | undefined): Partial<SignatureData> {
  if (!html) return {};
  const email = html.match(/mailto:([^"'>\s]+)/i)?.[1];
  const phone = html.match(/tel:([^"'>\s]+)/i)?.[1];
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const fullName = text.split(/[·|]/)[0]?.trim().slice(0, 80);
  return {
    ...(fullName ? { fullName } : {}),
    ...(email ? { email: decodeURIComponent(email) } : {}),
    ...(phone ? { phone: decodeURIComponent(phone) } : {}),
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
