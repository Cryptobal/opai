/**
 * Mapa de tipos legados (OpsDocumentoPersona.type) → código de TipoDocumento.
 * Nunca mapea a sin_clasificar: los desconocidos generan un tipo nuevo.
 */

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
};

export function normalizeLegacyTypeCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "tipo_desconocido";
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
 */
export function resolveLegacyType(
  rawType: string,
  hasAnyExpiry: boolean
): LegacyTypeResolution {
  const codigo = normalizeLegacyTypeCode(rawType);

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
