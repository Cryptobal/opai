/** Constantes de espejo Drive seguras para Client Components (sin googleapis). */

export const SUPPORTED_DOC_TYPES = [
  "cotizacion",
  "factura",
  "licitacion",
  "negocios",
  "personas",
  "documentos",
  "leads",
  "trabajadores",
  "ops_documentos",
] as const;
export type SupportedDocType = (typeof SUPPORTED_DOC_TYPES)[number];

export const DEFAULT_MIRROR_CONFIG: Record<string, boolean> = {
  cotizacion: true,
  factura: true,
  estado_pago: false,
  liquidacion: false,
  informe_supervision: false,
  licitacion: true,
  // Espejo de documentos adjuntos a negocios y a contactos CRM.
  negocios: true,
  personas: true,
  // Documentos de cuenta/instalación (CRM)
  documentos: true,
  // OFF por defecto — activación explícita
  leads: false,
  trabajadores: false,
  ops_documentos: false,
};

/** Agrupación UI por módulo Drive. */
export const MIRROR_DOC_TYPE_GROUPS: Array<{
  module: "comercial" | "personas" | "operaciones";
  label: string;
  tenantModules: string[];
  docTypes: SupportedDocType[];
}> = [
  {
    module: "comercial",
    label: "Comercial",
    tenantModules: ["crm", "cpq"],
    docTypes: [
      "cotizacion",
      "factura",
      "negocios",
      "licitacion",
      "personas",
      "documentos",
      "leads",
    ],
  },
  {
    module: "personas",
    label: "Personas",
    tenantModules: ["personas"],
    docTypes: ["trabajadores"],
  },
  {
    module: "operaciones",
    label: "Operaciones",
    tenantModules: ["documentos", "ops_supervision"],
    docTypes: ["ops_documentos"],
  },
];
