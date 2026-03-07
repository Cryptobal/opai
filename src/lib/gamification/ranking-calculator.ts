import { prisma } from "@/lib/prisma";

export async function calcularRankings(
  tenantId: string,
  periodo: string,
  periodoTipo: string,
): Promise<void> {
  const scores = await prisma.gamificacionScoreGuardia.findMany({
    where: { tenantId, periodo, periodoTipo },
    select: { id: true, guardiaId: true, installationId: true, trustScore: true },
    orderBy: { trustScore: "desc" },
  });

  if (scores.length === 0) return;

  // Global ranking — batch update
  const globalUpdates = scores.map((s, i) =>
    prisma.gamificacionScoreGuardia.update({
      where: { id: s.id },
      data: { rankingGlobal: i + 1, totalGuardiasGlobal: scores.length },
    }),
  );
  await prisma.$transaction(globalUpdates);

  // Per-installation ranking
  const byInstallation = new Map<string, typeof scores>();
  for (const s of scores) {
    if (!s.installationId) continue;
    const arr = byInstallation.get(s.installationId) ?? [];
    arr.push(s);
    byInstallation.set(s.installationId, arr);
  }

  for (const [, instScores] of byInstallation) {
    instScores.sort((a, b) => b.trustScore - a.trustScore);
    const instUpdates = instScores.map((s, i) =>
      prisma.gamificacionScoreGuardia.update({
        where: { id: s.id },
        data: { rankingInstalacion: i + 1, totalGuardiasInstalacion: instScores.length },
      }),
    );
    await prisma.$transaction(instUpdates);
  }
}
