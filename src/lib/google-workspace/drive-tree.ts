import type { TenantModuleKey } from "@/lib/tenant-modules";
import { prisma } from "@/lib/prisma";

export type DriveModuleKey = "comercial" | "personas" | "operaciones";

export type DriveFolderEntity = {
  entityType: string;
  entityId: string;
  pathKey: string;
  driveFolderId: string;
};

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

/**
 * Resolución inversa: driveFolderId → entidad OPAI.
 * Única vía — no parsear nombres de carpeta (mutables/colisionables).
 */
export async function resolveEntityFromFolderId(
  tenantId: string,
  driveFolderId: string,
): Promise<DriveFolderEntity | null> {
  if (!driveFolderId) return null;
  const row = await prisma.driveFolderCache.findFirst({
    where: {
      tenantId,
      driveFolderId,
      entityType: { not: null },
      entityId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!row?.entityType || !row.entityId) return null;
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    pathKey: row.pathKey,
    driveFolderId: row.driveFolderId,
  };
}

/** Hint de entidad a partir del pathKey (solo para backfill de caché). */
export type PathEntityHint = {
  entityType: "deal" | "lead" | "account" | "contact" | "installation" | "trabajador";
  leafName: string;
  accountName?: string;
  module?: DriveModuleKey;
};

export function inferEntityHintFromPathKey(pathKey: string): PathEntityHint | null {
  const p = pathKey.split("/").map((s) => s.trim()).filter(Boolean);
  // v2 CRM
  if (p[0] === "Comercial" && p[1] === "Negocios" && p.length === 4) {
    return { entityType: "deal", leafName: p[3]!, module: "comercial" };
  }
  if (p[0] === "Comercial" && p[1] === "Licitaciones" && p.length === 4) {
    return { entityType: "deal", leafName: p[3]!, module: "comercial" };
  }
  if (p[0] === "Comercial" && p[1] === "Leads" && p.length === 4) {
    return { entityType: "lead", leafName: p[3]!, module: "comercial" };
  }
  if (p[0] === "Comercial" && p[1] === "Cuentas" && p[3] === "General" && p.length === 4) {
    return { entityType: "account", leafName: p[2]!, module: "comercial" };
  }
  if (
    p[0] === "Comercial" &&
    p[1] === "Cuentas" &&
    p[3] === "Contactos" &&
    p.length === 5
  ) {
    return {
      entityType: "contact",
      leafName: p[4]!,
      accountName: p[2],
      module: "comercial",
    };
  }
  if (
    p[0] === "Comercial" &&
    p[1] === "Cuentas" &&
    p.length === 5 &&
    (p[4] === "Documentos" || p[4] === "Cotizaciones" || p[4] === "Facturas")
  ) {
    return {
      entityType: "installation",
      leafName: p[3]!,
      accountName: p[2],
      module: "comercial",
    };
  }
  if (p[0] === "Personas" && p.length === 2) {
    return { entityType: "trabajador", leafName: p[1]!, module: "personas" };
  }
  // v1
  if (p[0] === "Negocios" && p.length === 3) {
    return { entityType: "deal", leafName: p[2]!, module: "comercial" };
  }
  if (p[0] === "Licitaciones" && p.length === 3) {
    return { entityType: "deal", leafName: p[2]!, module: "comercial" };
  }
  if (p[0] === "Clientes" && p[2] === "General" && p.length >= 3) {
    return { entityType: "account", leafName: p[1]!, module: "comercial" };
  }
  if (p[0] === "Clientes" && p[2] === "Personas" && p.length === 4) {
    return {
      entityType: "contact",
      leafName: p[3]!,
      accountName: p[1],
      module: "comercial",
    };
  }
  if (p[0] === "Clientes" && p.length === 4 && p[3] === "Documentos") {
    return {
      entityType: "installation",
      leafName: p[2]!,
      accountName: p[1],
      module: "comercial",
    };
  }
  return null;
}
