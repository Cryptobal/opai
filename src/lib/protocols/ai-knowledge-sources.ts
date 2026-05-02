import { prisma } from "@/lib/prisma";

export type AiKnowledgeSource = {
  id: string;
  origin: "doc_operacional" | "protocol_document_legacy";
  scope: "global" | "instalacion";
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  tipoCodigo: string | null;
  tipoNombre: string | null;
  installationId: string | null;
};

/**
 * Devuelve PDFs marcados como usables por la IA como base de conocimiento.
 *
 * Reglas:
 *   - DocOperacional con tipo.useAsAiKnowledge=true y status≠"vencido"
 *   - Filtrado por capa: "global" (sin installationId) o "instalacion"
 *     (con installationId)
 *   - Fallback al sistema legacy ProtocolDocument scope=global solo si NO
 *     hay ningún DocOperacional global usable. Esto permite una transición
 *     segura para tenants que aún no migraron sus PDFs.
 */
export async function getAiKnowledgeSources(args: {
  tenantId: string;
  installationId?: string | null;
  documentIds?: string[];
}): Promise<AiKnowledgeSource[]> {
  const { tenantId, installationId, documentIds } = args;
  const idFilter =
    documentIds && documentIds.length > 0 ? { id: { in: documentIds } } : {};

  const globalDocs = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      capa: "global",
      status: { not: "vencido" },
      tipo: { useAsAiKnowledge: true },
      ...idFilter,
    },
    include: { tipo: true },
  });

  const instDocs = installationId
    ? await prisma.docOperacional.findMany({
        where: {
          tenantId,
          capa: "instalacion",
          installationId,
          status: { not: "vencido" },
          tipo: { useAsAiKnowledge: true },
          ...idFilter,
        },
        include: { tipo: true },
      })
    : [];

  const fromOps: AiKnowledgeSource[] = [...globalDocs, ...instDocs].map((d) => ({
    id: d.id,
    origin: "doc_operacional",
    scope: d.capa as "global" | "instalacion",
    fileName: d.fileName,
    fileUrl: d.fileUrl,
    fileSize: d.fileSize,
    tipoCodigo: d.tipo?.codigo ?? null,
    tipoNombre: d.tipo?.nombre ?? null,
    installationId: d.installationId,
  }));

  if (fromOps.filter((x) => x.scope === "global").length === 0) {
    const legacy = await prisma.protocolDocument.findMany({
      where: {
        tenantId,
        scope: "global",
        ...idFilter,
      },
    });
    fromOps.push(
      ...legacy.map<AiKnowledgeSource>((d) => ({
        id: d.id,
        origin: "protocol_document_legacy",
        scope: "global",
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        tipoCodigo: null,
        tipoNombre: null,
        installationId: null,
      })),
    );
  }

  return fromOps;
}

/**
 * Prioridad del PDF como insumo para la IA. Más alto = más relevante.
 * Se usa para decidir cuál se manda como ancla principal cuando hay un
 * límite de tokens (ej. 3 PDFs).
 */
const PRIORITY: Record<string, number> = {
  matriz_riesgo: 100,
  plan_emergencia: 90,
  plan_evacuacion: 85,
  plan_contingencia: 80,
  protocolo_emergencias: 70,
  protocolo: 65,
  manual_seguridad: 60,
};

function priorityFor(codigo: string | null): number {
  if (!codigo) return 0;
  if (PRIORITY[codigo] != null) return PRIORITY[codigo];
  for (const key of Object.keys(PRIORITY)) {
    if (codigo.startsWith(key)) return PRIORITY[key];
  }
  return 0;
}

export function rankSourcesForPrompt(
  sources: AiKnowledgeSource[],
): AiKnowledgeSource[] {
  return [...sources].sort((a, b) => {
    const pa = priorityFor(a.tipoCodigo);
    const pb = priorityFor(b.tipoCodigo);
    if (pa !== pb) return pb - pa;
    if (a.scope !== b.scope) return a.scope === "instalacion" ? -1 : 1;
    return a.fileName.localeCompare(b.fileName);
  });
}
