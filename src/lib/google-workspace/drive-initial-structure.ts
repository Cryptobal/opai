import { prisma } from "@/lib/prisma";
import { ensureFolderPath } from "./drive.service";

/**
 * Crea (idempotente vía DriveFolderCache) las carpetas raíz del espejo:
 * Opai/Clientes, Opai/Negocios/{año}, Opai/Licitaciones/{año}.
 * Registra una fila SENT en la outbox como actividad.
 */
export async function ensureInitialDriveStructure(tenantId: string): Promise<{
  paths: string[];
}> {
  const year = String(new Date().getFullYear());
  const paths = [
    ["Clientes"],
    ["Negocios", year],
    ["Licitaciones", year],
  ];

  const created: string[] = [];
  for (const segs of paths) {
    const id = await ensureFolderPath(tenantId, segs);
    if (!id) throw new Error(`No se pudo crear Opai/${segs.join("/")}`);
    created.push(`Opai/${segs.join("/")}`);
  }

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

  return { paths: created };
}
