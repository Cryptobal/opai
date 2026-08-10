import type { TenantModuleKey } from "@/lib/tenant-modules";

export type DriveModuleKey = "comercial" | "personas" | "operaciones";

export const MODULE_FOLDERS: Record<
  DriveModuleKey,
  { label: string; tenantModules: TenantModuleKey[]; docTypes: string[] }
> = {
  comercial: {
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
  personas: {
    label: "Personas",
    tenantModules: ["personas"],
    docTypes: ["trabajadores"],
  },
  operaciones: {
    label: "Operaciones",
    tenantModules: ["documentos", "ops_supervision"],
    docTypes: ["ops_documentos"],
  },
};

export const DOC_TYPE_TO_MODULE: Record<string, DriveModuleKey> = {
  cotizacion: "comercial",
  factura: "comercial",
  negocios: "comercial",
  licitacion: "comercial",
  personas: "comercial",
  documentos: "comercial",
  leads: "comercial",
  trabajadores: "personas",
  ops_documentos: "operaciones",
};

/** Normaliza un segmento de carpeta Drive (única implementación). */
export function safeSegment(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).trim() || fallback;
  return raw
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function pathSegments(path: string): string[] {
  return path.split("/").map((s) => s.trim()).filter(Boolean);
}

export function moduleHasActiveDocType(
  module: DriveModuleKey,
  config: Record<string, boolean>,
): boolean {
  return MODULE_FOLDERS[module].docTypes.some((dt) => config[dt] === true);
}

export function isModuleFolderEnabled(
  module: DriveModuleKey,
  config: Record<string, boolean>,
  enabledModules: ReadonlySet<string> | string[],
): boolean {
  const set = enabledModules instanceof Set ? enabledModules : new Set(enabledModules);
  const meta = MODULE_FOLDERS[module];
  const tenantOk = meta.tenantModules.some((m) => set.has(m));
  return tenantOk && moduleHasActiveDocType(module, config);
}

/** Preview estático del árbol v2 según toggles y módulos habilitados. */
export function buildTreePreview(
  config: Record<string, boolean>,
  enabledModules: ReadonlySet<string> | string[],
  rootName = "Opai",
): string[] {
  const lines: string[] = [`${rootName}/`];
  if (isModuleFolderEnabled("comercial", config, enabledModules)) {
    lines.push("  Comercial/");
    if (config.documentos || config.cotizacion || config.factura || config.personas) {
      lines.push("    Cuentas/{Cuenta}/");
      if (config.documentos) lines.push("      General/");
      if (config.personas) lines.push("      Contactos/{Contacto}/");
      if (config.documentos || config.cotizacion || config.factura) {
        lines.push("      {Instalación}/");
        if (config.documentos) lines.push("        Documentos/");
        if (config.cotizacion) lines.push("        Cotizaciones/");
        if (config.factura) lines.push("        Facturas/");
      }
    }
    if (config.negocios) lines.push("    Negocios/{Año}/{Negocio}/");
    if (config.leads) lines.push("    Leads/{Año}/{Lead}/");
    if (config.licitacion) lines.push("    Licitaciones/{Año}/{Licitación}/");
  }
  if (isModuleFolderEnabled("personas", config, enabledModules)) {
    lines.push("  Personas/");
    lines.push("    {RUT} — {Apellido Nombre}/");
  }
  if (isModuleFolderEnabled("operaciones", config, enabledModules)) {
    lines.push("  Operaciones/");
    if (config.ops_documentos) {
      lines.push("    Instalaciones/{Instalación}/Documentos/");
      lines.push("    Documentos generales/");
    }
  }
  return lines;
}

/** Paths v2 (por módulo). */
export const DrivePathsV2 = {
  accountGeneral: (cuenta: string) => `Comercial/Cuentas/${cuenta}/General`,
  contact: (cuenta: string, contacto: string) =>
    `Comercial/Cuentas/${cuenta}/Contactos/${contacto}`,
  installationDocs: (cuenta: string, inst: string) =>
    `Comercial/Cuentas/${cuenta}/${inst}/Documentos`,
  installationQuotes: (cuenta: string, inst: string) =>
    `Comercial/Cuentas/${cuenta}/${inst}/Cotizaciones`,
  installationInvoices: (cuenta: string, inst: string) =>
    `Comercial/Cuentas/${cuenta}/${inst}/Facturas`,
  deal: (year: string, name: string) => `Comercial/Negocios/${year}/${name}`,
  licitacion: (year: string, name: string) => `Comercial/Licitaciones/${year}/${name}`,
  lead: (year: string, name: string) => `Comercial/Leads/${year}/${name}`,
  trabajador: (label: string) => `Personas/${label}`,
  opsInstallation: (inst: string) => `Operaciones/Instalaciones/${inst}/Documentos`,
  opsGeneral: () => `Operaciones/Documentos generales`,
} as const;

/** Paths v1 (árbol plano legacy, pre-migración). */
export const DrivePathsV1 = {
  accountGeneral: (cuenta: string) => `Clientes/${cuenta}/General/Documentos`,
  contact: (cuenta: string, contacto: string) => `Clientes/${cuenta}/Personas/${contacto}`,
  installationDocs: (cuenta: string, inst: string) => `Clientes/${cuenta}/${inst}/Documentos`,
  installationQuotes: (cuenta: string, inst: string) => `Clientes/${cuenta}/${inst}/Cotizaciones`,
  installationInvoices: (cuenta: string, inst: string) => `Clientes/${cuenta}/${inst}/Facturas`,
  deal: (year: string, name: string) => `Negocios/${year}/${name}`,
  licitacion: (year: string, name: string) => `Licitaciones/${year}/${name}`,
  lead: (year: string, name: string) => `Negocios/${year}/${name}`, // v1 no tenía leads
} as const;
