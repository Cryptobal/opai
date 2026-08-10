import { prisma } from "@/lib/prisma";
import { getTenantEnabledModules } from "@/lib/tenant-modules";
import { ensureFolderPath } from "./drive.service";
import {
  DEFAULT_MIRROR_CONFIG,
} from "./drive-mirror-config";
import {
  isModuleFolderEnabled,
  type DriveModuleKey,
  MODULE_FOLDERS,
} from "./drive-tree";

function asConfig(raw: unknown): Record<string, boolean> {
  const base = { ...DEFAULT_MIRROR_CONFIG };
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

/**
 * Crea (idempotente) las carpetas de módulo habilitadas bajo la raíz.
 * Solo módulos con TenantModule activo y al menos un docType ON.
 * Marca structureVersion = 2.
 */
export async function ensureInitialDriveStructure(tenantId: string): Promise<{
  paths: string[];
  skipped: Array<{ module: DriveModuleKey; reason: string }>;
}> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
  });
  if (!ws) throw new Error("Drive no conectado");

  const config = asConfig(ws.mirrorConfig);
  const enabled = await getTenantEnabledModules(tenantId);
  const year = String(new Date().getFullYear());
  const created: string[] = [];
  const skipped: Array<{ module: DriveModuleKey; reason: string }> = [];

  const modulePaths: Partial<Record<DriveModuleKey, string[][]>> = {
    comercial: [
      ["Comercial"],
      ["Comercial", "Cuentas"],
      ["Comercial", "Negocios", year],
      ["Comercial", "Licitaciones", year],
    ],
    personas: [["Personas"]],
    operaciones: [
      ["Operaciones"],
      ["Operaciones", "Instalaciones"],
      ["Operaciones", "Documentos generales"],
    ],
  };

  for (const mod of Object.keys(MODULE_FOLDERS) as DriveModuleKey[]) {
    if (!isModuleFolderEnabled(mod, config, enabled)) {
      const meta = MODULE_FOLDERS[mod];
      const tenantOk = meta.tenantModules.some((m) => enabled.has(m));
      skipped.push({
        module: mod,
        reason: !tenantOk
          ? "módulo tenant deshabilitado"
          : "ningún docType activo en mirrorConfig",
      });
      continue;
    }
    for (const segs of modulePaths[mod] ?? []) {
      // Carpetas de leads solo si el toggle está ON
      if (mod === "comercial" && config.leads) {
        /* Leads/{año} se crea perezoso; no forzar aquí */
      }
      const id = await ensureFolderPath(tenantId, segs);
      if (!id) throw new Error(`No se pudo crear ${segs.join("/")}`);
      created.push(segs.join("/"));
    }
    if (mod === "comercial" && config.leads) {
      const segs = ["Comercial", "Leads", year];
      const id = await ensureFolderPath(tenantId, segs);
      if (!id) throw new Error(`No se pudo crear ${segs.join("/")}`);
      created.push(segs.join("/"));
    }
  }

  if (created.length === 0) {
    return { paths: [], skipped };
  }

  await prisma.googleDriveWorkspace.update({
    where: { id: ws.id },
    data: { structureVersion: 2 },
  });

  await prisma.driveExportOutbox.create({
    data: {
      tenantId,
      docType: "estructura",
      sourceType: "manual",
      sourceId: `structure:${year}`,
      fileName: "Estructura inicial creada",
      targetPath: created.join(", "),
      status: "SENT",
      sentAt: new Date(),
    },
  });

  return { paths: created, skipped };
}
