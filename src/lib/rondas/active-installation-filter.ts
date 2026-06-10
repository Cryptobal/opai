import type { Prisma } from "@prisma/client";

/**
 * Filtro Prisma para OpsRondaEjecucion que oculta las ejecuciones cuya
 * instalación (resuelta por `installationId` directo o vía `rondaTemplate`)
 * NO esté en estado `active`.
 *
 * Reglas:
 *  - Si la ejecución tiene `installationId`, manda el estado de esa instalación.
 *  - Si no, se mira la instalación del `rondaTemplate`.
 *  - Las rondas ad-hoc / sin instalación alguna se conservan (no se excluyen).
 *
 * Se expresa como NOT(...) para que sólo se descarten las ejecuciones que
 * resuelven a una instalación inactiva o prospect, dejando intacto todo lo demás.
 */
export const onlyActiveInstallationEjecucion: Prisma.OpsRondaEjecucionWhereInput = {
  NOT: {
    OR: [
      { installation: { status: { not: "active" } } },
      {
        installationId: null,
        rondaTemplate: { installation: { status: { not: "active" } } },
      },
    ],
  },
};
