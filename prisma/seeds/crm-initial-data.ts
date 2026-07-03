import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PIPELINE_STAGES = [
  { name: 'Prospección', order: 1, color: '#64748b' },
  { name: 'Cotización enviada', order: 2, color: '#3b82f6' },
  { name: 'Primer seguimiento', order: 3, color: '#f59e0b' },
  { name: 'Segundo seguimiento', order: 4, color: '#f97316' },
  { name: 'Negociación', order: 5, color: '#8b5cf6' },
  // Etapa ganadora canónica. El nombre del negocio es "Adjudicado"; el flag
  // isClosedWon es la fuente de verdad (no el nombre) para todo el código.
  { name: 'Adjudicado', order: 6, color: '#10b981', isClosedWon: true },
  { name: 'Perdido', order: 7, color: '#ef4444', isClosedLost: true },
];

export async function seedCrmData(tenantId: string) {
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    await prisma.crmPipelineStage.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: stage.name,
        },
      },
      update: {
        order: stage.order,
        color: stage.color,
        isClosedWon: stage.isClosedWon ?? false,
        isClosedLost: stage.isClosedLost ?? false,
        isActive: true,
      },
      create: {
        tenantId,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        isClosedWon: stage.isClosedWon ?? false,
        isClosedLost: stage.isClosedLost ?? false,
        isActive: true,
      },
    });
  }
}
