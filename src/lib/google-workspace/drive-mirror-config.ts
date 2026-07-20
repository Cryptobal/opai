/** Constantes de espejo Drive seguras para Client Components (sin googleapis). */

export const SUPPORTED_DOC_TYPES = ["cotizacion", "factura", "licitacion"] as const;
export type SupportedDocType = (typeof SUPPORTED_DOC_TYPES)[number];

export const DEFAULT_MIRROR_CONFIG: Record<string, boolean> = {
  cotizacion: true,
  factura: true,
  estado_pago: false,
  liquidacion: false,
  informe_supervision: false,
  licitacion: true,
};
