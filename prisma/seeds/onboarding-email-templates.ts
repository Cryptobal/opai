/**
 * Seed de plantillas de email para Onboarding de guardias.
 * Crea la plantilla default de onboarding si no existe.
 */

import type { PrismaClient } from "@prisma/client";

const DEFAULT_ONBOARDING_BLOCKS = [
  {
    id: "header-1",
    tipo: "header" as const,
    contenido: {
      titulo: "Bienvenido a OPAI",
      subtitulo: "Tu cuenta ya está activa",
    },
    orden: 0,
  },
  {
    id: "texto-1",
    tipo: "texto" as const,
    contenido: {
      texto:
        "Hola {{nombre}}, bienvenido al equipo. Tu cuenta en OPAI ya está activa.",
    },
    orden: 1,
  },
  {
    id: "pin-1",
    tipo: "pin" as const,
    contenido: {
      textoAntes: "Tu PIN de acceso es:",
      textoDespues: "Guárdalo en un lugar seguro. Lo necesitarás para acceder a los portales.",
    },
    orden: 2,
  },
  {
    id: "texto-2",
    tipo: "texto" as const,
    contenido: {
      texto:
        "OPAI es la plataforma tecnológica que usamos para gestionar todas las operaciones de seguridad. A continuación te explicamos los portales a los que tienes acceso:",
    },
    orden: 3,
  },
  {
    id: "portales-1",
    tipo: "portales" as const,
    contenido: {
      mostrarGuardia: true,
      mostrarRondas: true,
      mostrarAcceso: true,
    },
    orden: 4,
  },
  {
    id: "texto-3",
    tipo: "texto" as const,
    contenido: {
      texto:
        "Si tienes dudas, contacta a tu supervisor o escríbenos por el chat interno de OPAI.",
    },
    orden: 5,
  },
  {
    id: "footer-1",
    tipo: "footer" as const,
    contenido: {
      texto: "OPAI — Gard Security",
    },
    orden: 6,
  },
];

const VARIABLES = [
  "nombre",
  "primerNombre",
  "pin",
  "email",
  "rut",
  "cargo",
  "sitio",
  "cliente",
  "supervisor",
  "fechaInicio",
  "portalGuardia",
  "portalRondas",
  "portalAcceso",
];

export async function seedOnboardingEmailTemplates(
  prisma: PrismaClient,
  tenantId: string
) {
  const existing = await prisma.opsEmailTemplate.findFirst({
    where: {
      tenantId,
      tipo: "ONBOARDING",
      esDefault: true,
    },
  });

  if (existing) {
    console.log("✅ Plantilla ONBOARDING default ya existe");
    return;
  }

  // Desmarcar cualquier default anterior del mismo tipo
  await prisma.opsEmailTemplate.updateMany({
    where: { tenantId, tipo: "ONBOARDING" },
    data: { esDefault: false },
  });

  await prisma.opsEmailTemplate.create({
    data: {
      tenantId,
      nombre: "Onboarding - Bienvenida guardia",
      asunto: "Bienvenido a OPAI — Tu cuenta está activa",
      tipo: "ONBOARDING",
      contenido: DEFAULT_ONBOARDING_BLOCKS as object,
      variables: VARIABLES,
      activo: true,
      esDefault: true,
    },
  });

  console.log("✅ Plantilla ONBOARDING default creada");

  // Plantilla RECORDATORIO 48h (para cron)
  const existingRecordatorio = await prisma.opsEmailTemplate.findFirst({
    where: { tenantId, tipo: "RECORDATORIO", esDefault: true },
  });

  if (!existingRecordatorio) {
    await prisma.opsEmailTemplate.create({
      data: {
        tenantId,
        nombre: "Recordatorio - Accede a OPAI",
        asunto: "Recordatorio: Tu cuenta OPAI está lista — Accede a los portales",
        tipo: "RECORDATORIO",
        contenido: [
          {
            id: "header-r",
            tipo: "header",
            contenido: { titulo: "Recordatorio: Accede a OPAI", subtitulo: "Tu cuenta está activa" },
            orden: 0,
          },
          {
            id: "texto-r",
            tipo: "texto",
            contenido: {
              texto:
                "Hola {{nombre}}, te enviamos este recordatorio porque aún no has accedido a los portales de OPAI. Tu PIN es {{pin}}. Accede desde los siguientes enlaces:",
            },
            orden: 1,
          },
          {
            id: "portales-r",
            tipo: "portales",
            contenido: { mostrarGuardia: true, mostrarRondas: true, mostrarAcceso: true },
            orden: 2,
          },
          {
            id: "footer-r",
            tipo: "footer",
            contenido: { texto: "OPAI — Gard Security" },
            orden: 3,
          },
        ] as object,
        variables: VARIABLES,
        activo: true,
        esDefault: true,
      },
    });
    console.log("✅ Plantilla RECORDATORIO default creada");
  }
}
