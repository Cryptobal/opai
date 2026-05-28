import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * ¿El tenant tiene al menos una bank tx NO manual creada en los últimos 7 días?
 * Si no, asumimos que el banco no está sincronizado → el cierre manual pasa a
 * ser el modo por defecto (sin saldo real confiable que anclar).
 */
export async function isBankConnected(tenantId: string): Promise<boolean> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recent = await prisma.financeBankTransaction.count({
    where: {
      tenantId,
      createdAt: { gte: sevenDaysAgo },
      source: { not: "MANUAL" },
    },
  });
  return recent > 0;
}
