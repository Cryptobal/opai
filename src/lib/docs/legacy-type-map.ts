/**
 * Mapa de tipos legados (OpsDocumentoPersona.type) → código de TipoDocumento.
 * Nunca mapea a sin_clasificar: los desconocidos generan un tipo nuevo.
 * Códigos vacíos / "undefined" / "null" no son válidos: `resolveLegacyType` devuelve null.
 */

export const UNCLASSIFIED_GUARDIA_TIPO = "sin_clasificar_guardia";

const INVALID_TYPE_CODES = new Set(["undefined", "null", "tipo_desconocido"]);

export type LegacyTypeResolution =
  | { kind: "mapped"; codigo: string }
  | {
      kind: "create";
      codigo: string;
      nombre: string;
      capa: "guardia";
      obligatorio: false;
      normativa: null;
      diasAlerta: 30;
      /** Inferido de si alguna fila con ese type tiene expiresAt. */
      tieneVencimiento: boolean;
    };

/** Códigos del catálogo que coinciden 1:1 con el string legado. */
const DIRECT_MATCH = new Set([
  "certificado_antecedentes",
  "certificado_os10",
  "credencial_os10",
  "examen_psicologico",
  "registro_capacitacion",
  "historial_penal",
  "contrato_guardia",
]);

/**
 * Alias conocidos: type legado → codigo del catálogo.
 * contrato / anexo* no coinciden con contrato_guardia del catálogo seed;
 * se mapean explícitamente.
 */
const EXPLICIT_MAP: Record<string, string> = {
  contrato: "contrato_guardia",
  contrato_firmado: "contrato_guardia",
  anexo: "anexo_contrato",
  anexo_contrato: "anexo_contrato",
  examen: "examen_psicologico",
  certificado_afp: "certificado_afp",
  certificado_fonasa_isapre: "certificado_fonasa_isapre",
  certificado_ensenanza_media: "certificado_ensenanza_media",
  cedula_identidad: "cedula_identidad",
  curriculum: "curriculum",
  custom_historial_penal: "historial_penal",
};

export function normalizeLegacyTypeCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const codigo = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!codigo || INVALID_TYPE_CODES.has(codigo)) return null;
  return codigo;
}

export function humanizeTypeCode(codigo: string): string {
  return codigo
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resuelve un type legado a un código de catálogo o a una creación automática.
 * `hasAnyExpiry` indica si alguna fila con ese type tiene expiresAt no nulo.
 * Devuelve null si el type es vacío, "undefined", "null" o no produce un código usable.
 */
export function resolveLegacyType(
  rawType: string | null | undefined,
  hasAnyExpiry: boolean
): LegacyTypeResolution | null {
  const codigo = normalizeLegacyTypeCode(rawType);
  if (!codigo) return null;

  if (EXPLICIT_MAP[codigo]) {
    return { kind: "mapped", codigo: EXPLICIT_MAP[codigo] };
  }
  if (DIRECT_MATCH.has(codigo)) {
    return { kind: "mapped", codigo };
  }

  return {
    kind: "create",
    codigo,
    nombre: humanizeTypeCode(codigo),
    capa: "guardia",
    obligatorio: false,
    normativa: null,
    diasAlerta: 30,
    tieneVencimiento: hasAnyExpiry,
  };
}

/** Código canónico de catálogo, o `sin_clasificar_guardia` si el type es inválido. */
export function canonicalGuardiaTypeCode(rawType: string | null | undefined): string {
  return resolveLegacyType(rawType, false)?.codigo ?? UNCLASSIFIED_GUARDIA_TIPO;
}
