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
      textoDespues: "Guárdalo en un lugar seguro. Lo necesitarás para acceder al Portal del Guardia.",
    },
    orden: 2,
  },
  {
    id: "texto-2",
    tipo: "texto" as const,
    contenido: {
      texto:
        "OPAI es la plataforma que usamos para gestionar todas las operaciones de seguridad. Desde el Portal del Guardia podrás gestionar tu día a día. Estas son algunas de las cosas que puedes hacer:",
    },
    orden: 3,
  },
  {
    id: "features-1",
    tipo: "caracteristicas" as const,
    contenido: {
      items: [
        {
          emoji: "\u{1F4C5}",
          titulo: "Consulta tu pauta de turnos",
          descripcion: "Ve tu calendario mensual con todos tus turnos, descansos, vacaciones y permisos.",
        },
        {
          emoji: "\u{1F4DD}",
          titulo: "Haz solicitudes",
          descripcion: "Pide vacaciones, permisos, reporta problemas con tu pago, solicita uniforme o equipo, y más.",
        },
        {
          emoji: "\u{1F3C6}",
          titulo: "Revisa tu desempeño",
          descripcion: "Consulta tu puntaje, ranking, insignias, desafíos y canjea beneficios por tus logros.",
        },
        {
          emoji: "\u{1F4D6}",
          titulo: "Accede a tu protocolo",
          descripcion: "Lee el protocolo de tu instalación, documentos de referencia y contactos de emergencia.",
        },
        {
          emoji: "\u{270F}\u{FE0F}",
          titulo: "Rinde exámenes",
          descripcion: "Completa los exámenes asignados, revisa tus resultados y mejora tu puntaje.",
        },
        {
          emoji: "\u{1F4AC}",
          titulo: "Chat con tu instalación",
          descripcion: "Comunícate directamente con tu equipo en la instalación asignada.",
        },
      ],
    },
    orden: 4,
  },
  {
    id: "separador-1",
    tipo: "separador" as const,
    contenido: {},
    orden: 5,
  },
  {
    id: "texto-3",
    tipo: "texto" as const,
    contenido: {
      texto:
        "Para acceder, ingresa con tu RUT y el PIN que te enviamos arriba desde cualquier navegador:",
    },
    orden: 6,
  },
  {
    id: "boton-1",
    tipo: "boton" as const,
    contenido: {
      label: "Acceder al Portal del Guardia",
      url: "{{portalGuardia}}",
    },
    orden: 7,
  },
  {
    id: "texto-4",
    tipo: "texto" as const,
    contenido: {
      texto:
        "\u{1F4F1} También puedes instalar OPAI como app en tu celular para acceder más rápido. Solo abre el portal desde tu navegador y selecciona \"Agregar a pantalla de inicio\".",
    },
    orden: 8,
  },
  {
    id: "texto-5",
    tipo: "texto" as const,
    contenido: {
      texto:
        "Si tienes dudas, contacta a tu supervisor o escríbenos por el chat interno de OPAI.",
    },
    orden: 9,
  },
  {
    id: "footer-1",
    tipo: "footer" as const,
    contenido: {
      texto: "OPAI — Gard Security",
    },
    orden: 10,
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
        asunto: "Recordatorio: Tu cuenta OPAI está lista — Accede al Portal del Guardia",
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
                "Hola {{nombre}}, te enviamos este recordatorio porque aún no has accedido al Portal del Guardia. Tu PIN es {{pin}}. Accede desde el siguiente enlace:",
            },
            orden: 1,
          },
          {
            id: "portales-r",
            tipo: "portales",
            contenido: { mostrarGuardia: true, mostrarRondas: false, mostrarAcceso: false },
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
