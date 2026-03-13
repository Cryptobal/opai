import { prisma } from "@/lib/prisma";

export async function trackPortalAccess(
  guardiaId: string,
  portal: "guardia" | "rondas" | "acceso"
) {
  const fieldMap = {
    guardia: { acceso: "accesoPortalGuardia", fecha: "fechaAccesoGuardia" },
    rondas: { acceso: "accesoPortalRondas", fecha: "fechaAccesoRondas" },
    acceso: { acceso: "accesoPortalAcceso", fecha: "fechaAccesoAcceso" },
  } as const;

  const field = fieldMap[portal];

  const result = await prisma.opsOnboardingStatus.updateMany({
    where: {
      guardiaId,
      [field.acceso]: false,
    },
    data: {
      [field.acceso]: true,
      [field.fecha]: new Date(),
      estado: "EN_PROGRESO",
    },
  });

  if (result.count === 0) return;

  const status = await prisma.opsOnboardingStatus.findUnique({
    where: { guardiaId },
  });

  if (
    status &&
    status.accesoPortalGuardia &&
    status.accesoPortalRondas &&
    status.accesoPortalAcceso
  ) {
    await prisma.opsOnboardingStatus.update({
      where: { guardiaId },
      data: { estado: "COMPLETADO", completadoAt: new Date() },
    });
  }
}
