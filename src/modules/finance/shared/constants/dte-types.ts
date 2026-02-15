/**
 * Chilean DTE (Documento Tributario Electronico) type codes
 * As defined by the SII (Servicio de Impuestos Internos)
 */

export const DTE_TYPES = {
  33: { code: 33, name: "Factura Electronica", shortName: "FE", affecta: true },
  34: { code: 34, name: "Factura No Afecta o Exenta", shortName: "FNE", affecta: false },
  39: { code: 39, name: "Boleta Electronica", shortName: "BE", affecta: true },
  52: { code: 52, name: "Guia de Despacho", shortName: "GD", affecta: true },
  56: { code: 56, name: "Nota de Debito", shortName: "ND", affecta: true },
  61: { code: 61, name: "Nota de Credito", shortName: "NC", affecta: true },
} as const;

export type DteTypeCode = keyof typeof DTE_TYPES;

export const VALID_DTE_TYPES = Object.keys(DTE_TYPES).map(Number) as DteTypeCode[];

export function getDteTypeName(code: number): string {
  const dte = DTE_TYPES[code as DteTypeCode];
  return dte?.name ?? `DTE Tipo ${code}`;
}

export function isDteTypeValid(code: number): code is DteTypeCode {
  return code in DTE_TYPES;
}

/**
 * Chilean IVA rate (19%)
 */
export const IVA_RATE = 19;

/**
 * Reference codes for nota de credito/debito
 */
export const DTE_REFERENCE_CODES = {
  1: "Anula Documento de Referencia",
  2: "Corrige Texto del Documento de Referencia",
  3: "Corrige Montos",
} as const;
