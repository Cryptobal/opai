/**
 * Seed: Gamificacion Config & Badges
 *
 * Configuracion por defecto y badges predefinidos para el sistema de gamificacion.
 * Usa upsert para ser idempotente — se puede ejecutar multiples veces sin duplicar datos.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Badge definitions ────────────────────────────────────────────────

type BadgeSeed = {
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  icono: string;
  condicionTipo: string;
  condicionValor: number;
  puntosBonus: number;
  esSecreto?: boolean;
  orden: number;
};

const BADGES: BadgeSeed[] = [
  // ── Rachas ──
  {
    codigo: "racha_fuego",
    nombre: "Racha de Fuego",
    descripcion: "Mantener una racha de 7 dias consecutivos",
    categoria: "rachas",
    icono: "\u{1F525}",
    condicionTipo: "racha_dias",
    condicionValor: 7,
    puntosBonus: 50,
    orden: 1,
  },
  {
    codigo: "imparable",
    nombre: "Imparable",
    descripcion: "Mantener una racha de 30 dias consecutivos",
    categoria: "rachas",
    icono: "\u{26A1}",
    condicionTipo: "racha_dias",
    condicionValor: 30,
    puntosBonus: 200,
    orden: 2,
  },
  {
    codigo: "leyenda",
    nombre: "Leyenda",
    descripcion: "Mantener una racha de 90 dias consecutivos",
    categoria: "rachas",
    icono: "\u{1F3C6}",
    condicionTipo: "racha_dias",
    condicionValor: 90,
    puntosBonus: 500,
    orden: 3,
  },

  // ── Asistencia ──
  {
    codigo: "puntualidad_reloj",
    nombre: "Puntualidad de Reloj",
    descripcion: "1 mes con asistencia perfecta",
    categoria: "asistencia",
    icono: "\u{23F0}",
    condicionTipo: "asistencia_perfecta_meses",
    condicionValor: 1,
    puntosBonus: 100,
    orden: 4,
  },
  {
    codigo: "guerrero",
    nombre: "Guerrero",
    descripcion: "3 meses con asistencia perfecta",
    categoria: "asistencia",
    icono: "\u{2694}\u{FE0F}",
    condicionTipo: "asistencia_perfecta_meses",
    condicionValor: 3,
    puntosBonus: 300,
    orden: 5,
  },
  {
    codigo: "inquebrantable",
    nombre: "Inquebrantable",
    descripcion: "6 meses con asistencia perfecta",
    categoria: "asistencia",
    icono: "\u{1F6E1}\u{FE0F}",
    condicionTipo: "asistencia_perfecta_meses",
    condicionValor: 6,
    puntosBonus: 600,
    orden: 6,
  },

  // ── Rondas ──
  {
    codigo: "halcon_nocturno",
    nombre: "Halcon Nocturno",
    descripcion: "Completar 50 rondas perfectas",
    categoria: "rondas",
    icono: "\u{1F985}",
    condicionTipo: "rondas_perfectas",
    condicionValor: 50,
    puntosBonus: 150,
    orden: 7,
  },
  {
    codigo: "ojo_aguila",
    nombre: "Ojo de Aguila",
    descripcion: "Reportar 10 incidentes",
    categoria: "rondas",
    icono: "\u{1F441}\u{FE0F}",
    condicionTipo: "incidentes_reportados",
    condicionValor: 10,
    puntosBonus: 100,
    orden: 8,
  },
  {
    codigo: "ruta_perfecta",
    nombre: "Ruta Perfecta",
    descripcion: "Completar 100 rondas perfectas",
    categoria: "rondas",
    icono: "\u{1F5FA}\u{FE0F}",
    condicionTipo: "rondas_perfectas",
    condicionValor: 100,
    puntosBonus: 300,
    orden: 9,
  },

  // ── Equipo ──
  {
    codigo: "pilar_equipo",
    nombre: "Pilar del Equipo",
    descripcion: "Recibir 20 reconocimientos de companeros",
    categoria: "equipo",
    icono: "\u{1F3DB}\u{FE0F}",
    condicionTipo: "reconocimientos_recibidos",
    condicionValor: 20,
    puntosBonus: 200,
    orden: 10,
  },
  {
    codigo: "motivador",
    nombre: "Motivador",
    descripcion: "Dar 50 reconocimientos a companeros",
    categoria: "equipo",
    icono: "\u{1F4AA}",
    condicionTipo: "reconocimientos_dados",
    condicionValor: 50,
    puntosBonus: 150,
    orden: 11,
  },

  // ── Capacitacion ──
  {
    codigo: "estudiante_estrella",
    nombre: "Estudiante Estrella",
    descripcion: "Obtener 3 examenes con nota perfecta",
    categoria: "capacitacion",
    icono: "\u{2B50}",
    condicionTipo: "examenes_perfectos",
    condicionValor: 3,
    puntosBonus: 200,
    orden: 12,
  },

  // ── Secretos ──
  {
    codigo: "sincronia_perfecta",
    nombre: "Sincronia Perfecta",
    descripcion: "Todos los guardias de la instalacion superan puntaje 80",
    categoria: "equipo",
    icono: "\u{1F3AF}",
    condicionTipo: "custom",
    condicionValor: 0,
    puntosBonus: 500,
    esSecreto: true,
    orden: 13,
  },
  {
    codigo: "madrugador",
    nombre: "Madrugador",
    descripcion: "Ser el primero en marcar entrada 5 dias seguidos",
    categoria: "asistencia",
    icono: "\u{1F305}",
    condicionTipo: "custom",
    condicionValor: 0,
    puntosBonus: 100,
    esSecreto: true,
    orden: 14,
  },
  {
    codigo: "guardian_ancestral",
    nombre: "Guardian Ancestral",
    descripcion: "1 ano completo en la misma instalacion",
    categoria: "rachas",
    icono: "\u{1F3F0}",
    condicionTipo: "custom",
    condicionValor: 0,
    puntosBonus: 1000,
    esSecreto: true,
    orden: 15,
  },
];

// ── Seed function ────────────────────────────────────────────────────

export async function seedGamification(tenantId: string): Promise<void> {
  console.log("  Seeding gamificacion config...");

  // 1. Upsert default config (all defaults come from the Prisma schema)
  const config = await prisma.gamificacionConfig.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });

  console.log(`    GamificacionConfig ready (id: ${config.id})`);

  // 2. Upsert badges
  console.log("  Seeding gamificacion badges...");

  for (const badge of BADGES) {
    await prisma.gamificacionBadge.upsert({
      where: {
        tenantId_codigo: { tenantId, codigo: badge.codigo },
      },
      update: {
        nombre: badge.nombre,
        descripcion: badge.descripcion,
        categoria: badge.categoria,
        icono: badge.icono,
        condicionTipo: badge.condicionTipo,
        condicionValor: badge.condicionValor,
        puntosBonus: badge.puntosBonus,
        esSecreto: badge.esSecreto ?? false,
        orden: badge.orden,
      },
      create: {
        tenantId,
        codigo: badge.codigo,
        nombre: badge.nombre,
        descripcion: badge.descripcion,
        categoria: badge.categoria,
        icono: badge.icono,
        condicionTipo: badge.condicionTipo,
        condicionValor: badge.condicionValor,
        puntosBonus: badge.puntosBonus,
        esSecreto: badge.esSecreto ?? false,
        orden: badge.orden,
      },
    });

    const secret = badge.esSecreto ? " (secreto)" : "";
    console.log(`    Badge "${badge.nombre}"${secret}`);
  }

  console.log(`  Seeded 1 config + ${BADGES.length} badges`);
}
