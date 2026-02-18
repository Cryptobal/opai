export const GUARDIA_LIFECYCLE_STATUSES = [
  "postulante",
  "seleccionado",
  "contratado",
  "te", // Turno Extra — ingreso rápido para cubrir ausencias
  "inactivo",
  "desvinculado",
] as const;

export type GuardiaLifecycleStatus = (typeof GUARDIA_LIFECYCLE_STATUSES)[number];

/** Transiciones permitidas desde cada estado. */
export function getLifecycleTransitions(currentStatus: string): GuardiaLifecycleStatus[] {
  const s = currentStatus.toLowerCase();
  if (s === "postulante") return ["seleccionado", "te", "inactivo", "contratado"];
  if (s === "seleccionado") return ["contratado", "inactivo", "desvinculado"];
  if (s === "te") return ["contratado", "inactivo", "desvinculado"];
  if (s === "contratado") return ["inactivo", "desvinculado"];
  if (s === "inactivo") return ["contratado", "te"];
  if (s === "desvinculado") return [];
  return [];
}

export const DOCUMENT_TYPES = [
  "certificado_antecedentes",
  "certificado_os10",
  "cedula_identidad",
  "curriculum",
  "contrato",
  "anexo_contrato",
  "certificado_ensenanza_media",
  "certificado_afp",
  "certificado_fonasa_isapre",
] as const;

export type GuardiaDocumentType = (typeof DOCUMENT_TYPES)[number];

/** Documentos por defecto para postulación (configurables en Operaciones). */
export const DEFAULT_POSTULACION_DOCUMENTS: Array<{ code: string; label: string; required: boolean }> = [
  { code: "certificado_antecedentes", label: "Certificado de antecedentes", required: false },
  { code: "certificado_os10", label: "Certificado OS-10", required: false },
  { code: "cedula_identidad", label: "Cédula de identidad", required: false },
  { code: "curriculum", label: "Currículum", required: false },
  { code: "contrato", label: "Contrato", required: false },
  { code: "anexo_contrato", label: "Anexo de contrato", required: false },
  { code: "certificado_ensenanza_media", label: "Certificado enseñanza media", required: false },
  { code: "certificado_afp", label: "Certificado AFP", required: false },
  { code: "certificado_fonasa_isapre", label: "Certificado Fonasa / Isapre", required: false },
];

export const DOCUMENT_STATUS = [
  "pendiente",
  "vigente",
  "vencido",
  "rechazado",
] as const;

export type GuardiaDocumentStatus = (typeof DOCUMENT_STATUS)[number];

export const BANK_ACCOUNT_TYPES = [
  "cuenta_corriente",
  "cuenta_vista",
  "cuenta_rut",
] as const;

export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const CHILE_BANKS = [
  { code: "BCH", name: "Banco de Chile", sbifCode: "001" },
  { code: "BSC", name: "Banco Santander Chile", sbifCode: "037" },
  { code: "BCE", name: "BancoEstado", sbifCode: "012" },
  { code: "BCI", name: "Banco de Crédito e Inversiones (BCI)", sbifCode: "016" },
  { code: "ITAU", name: "Banco Itaú Chile", sbifCode: "039" },
  { code: "SEC", name: "Banco Security", sbifCode: "049" },
  { code: "FAL", name: "Banco Falabella", sbifCode: "051" },
  { code: "RIP", name: "Banco Ripley", sbifCode: "053" },
  { code: "CON", name: "Banco Consorcio", sbifCode: "055" },
  { code: "INT", name: "Banco Internacional", sbifCode: "009" },
  { code: "CHI", name: "Banco BICE", sbifCode: "028" },
  { code: "EDW", name: "Banco Edwards-Citi", sbifCode: "504" },
  { code: "SCO", name: "Scotiabank Chile", sbifCode: "014" },
  { code: "HSBC", name: "HSBC Bank Chile", sbifCode: "031" },
  { code: "TENPO", name: "Tenpo Prepago / Cuenta", sbifCode: "730" },
  { code: "MACH", name: "MACH (Bci)", sbifCode: "016" },
].sort((a, b) => a.name.localeCompare(b.name, "es"));

export const CHILE_BANK_CODES = CHILE_BANKS.map((b) => b.code);

export const AFP_CHILE = [
  "Capital",
  "Cuprum",
  "Habitat",
  "PlanVital",
  "ProVida",
  "UNO",
  "Modelo",
] as const;

export const HEALTH_SYSTEMS = ["fonasa", "isapre"] as const;
export const ISAPRES_CHILE = [
  "Banmédica",
  "Colmena",
  "Consalud",
  "CruzBlanca",
  "Esencial",
  "Nueva Masvida",
  "Vida Tres",
] as const;
export const PERSON_SEX = ["masculino", "femenino"] as const;

export function normalizeNullable(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeRut(input: string): string {
  const compact = input.trim().replace(/\./g, "").toUpperCase();
  return compact;
}

export function computeRutDv(bodyDigits: string): string {
  let sum = 0;
  let multiplier = 2;
  for (let i = bodyDigits.length - 1; i >= 0; i -= 1) {
    sum += Number(bodyDigits[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  return remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
}

export function completeRutWithDv(input: string): string {
  const normalized = normalizeRut(input).replace(/[^0-9K-]/g, "");
  if (normalized.includes("-")) {
    const [rawBody, ...rawDvParts] = normalized.split("-");
    const body = rawBody.replace(/\D/g, "").slice(0, 8);
    const dv = rawDvParts.join("").replace(/[^0-9K]/g, "").slice(0, 1);
    if (body.length < 7 || body.length > 8) return normalized;
    return dv ? `${body}-${dv}` : `${body}-${computeRutDv(body)}`;
  }
  const compact = normalized.replace(/[^0-9K]/g, "").slice(0, 9);
  if (/^\d{7,8}$/.test(compact)) return `${compact}-${computeRutDv(compact)}`;
  if (/^\d{8}[0-9K]$/.test(compact)) return `${compact.slice(0, 8)}-${compact.slice(8)}`;
  if (/^\d{7}K$/.test(compact)) return `${compact.slice(0, 7)}-${compact.slice(7)}`;
  return compact;
}

export function formatRutForInput(input: string): string {
  const normalized = normalizeRut(input).replace(/[^0-9K-]/g, "");
  if (normalized.includes("-")) {
    const [rawBody, ...rawDvParts] = normalized.split("-");
    const body = rawBody.replace(/\D/g, "").slice(0, 8);
    if (!body) return "";
    const dv = rawDvParts.join("").replace(/[^0-9K]/g, "").slice(0, 1);
    if (dv) return `${body}-${dv}`;
    return normalized.endsWith("-") ? `${body}-` : body;
  }
  return normalized.replace(/[^0-9K]/g, "").slice(0, 9);
}

export function isChileanRutFormat(input: string): boolean {
  return /^\d{7,8}-[\dK]$/.test(normalizeRut(input));
}

export function isValidChileanRut(input: string): boolean {
  const rut = normalizeRut(input);
  if (!isChileanRutFormat(rut)) return false;
  const [body, dvInput] = rut.split("-");
  const dvExpected = computeRutDv(body);
  return dvInput === dvExpected;
}

export function normalizeMobileNineDigits(value: string): string {
  const onlyDigits = value.replace(/\D/g, "");
  if (onlyDigits.startsWith("56") && onlyDigits.length === 11) {
    return onlyDigits.slice(2);
  }
  return onlyDigits;
}

export function isValidMobileNineDigits(value: string): boolean {
  return /^9\d{8}$/.test(normalizeMobileNineDigits(value));
}

export const GUARDIA_COMM_CHANNELS = ["email", "whatsapp"] as const;
export type GuardiaCommunicationChannel = (typeof GUARDIA_COMM_CHANNELS)[number];

export type GuardiaCommunicationTemplate = {
  id: string;
  channel: GuardiaCommunicationChannel;
  name: string;
  subject?: string;
  body: string;
};

export const GUARDIA_COMM_TEMPLATES: GuardiaCommunicationTemplate[] = [
  {
    id: "docs_pendientes_email",
    channel: "email",
    name: "Solicitud de documentos",
    subject: "Documentos pendientes para tu postulación",
    body: "Hola {nombre}, por favor sube tus documentos pendientes para continuar tu proceso en Gard Security.",
  },
  {
    id: "entrevista_email",
    channel: "email",
    name: "Convocatoria a entrevista",
    subject: "Convocatoria a entrevista",
    body: "Hola {nombre}, te invitamos a entrevista. Responde este correo para coordinar disponibilidad.",
  },
  {
    id: "docs_pendientes_whatsapp",
    channel: "whatsapp",
    name: "Solicitud de documentos",
    body: "Hola {nombre}, necesitamos tus documentos pendientes (antecedentes, OS-10, cédula y CV).",
  },
  {
    id: "recordatorio_whatsapp",
    channel: "whatsapp",
    name: "Recordatorio de gestión",
    body: "Hola {nombre}, te recordamos completar tu ficha de guardia y responder este mensaje ante cualquier duda.",
  },
];

export function renderGuardiaTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, token: string) => vars[token] ?? "");
}

export function lifecycleToLegacyStatus(status: GuardiaLifecycleStatus | string): "active" | "inactive" {
  const s = status?.toLowerCase?.() ?? "";
  if (s === "contratado" || s === "te") return "active";
  return "inactive";
}

