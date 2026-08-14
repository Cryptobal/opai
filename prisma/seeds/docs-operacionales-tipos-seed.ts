/**
 * Seed: Tipos de documentos operacionales (normativa OS10 / DT)
 * Crea el catálogo de tipos por defecto para las 3 capas + sin_clasificar.
 */

import { PrismaClient } from "@prisma/client";

const TIPOS_DEFAULT = [
  // Capa GLOBAL
  { codigo: "os10_empresa", nombre: "OS10 Gard (Decreto Exento)", capa: "global", obligatorio: true, tieneVencimiento: true, diasAlerta: 60, normativa: "D.L. 3.607", order: 1 },
  { codigo: "seguro_vida", nombre: "Seguro de Vida", capa: "global", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "D.S. 93 Art.13 — Mínimo 75 UTM", order: 2 },
  { codigo: "seguro_resp_civil", nombre: "Seguro de Responsabilidad Civil", capa: "global", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "Póliza empresa", order: 3 },
  { codigo: "centralizacion_dt", nombre: "Resolución Centralización DT", capa: "global", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "CT Art.31 — Vigencia 1 año", order: 4 },
  { codigo: "reglamento_interno", nombre: "Reglamento Interno OHS", capa: "global", obligatorio: true, tieneVencimiento: false, diasAlerta: 0, normativa: "CT Art.154", order: 5 },
  { codigo: "protocolos_operacionales", nombre: "Protocolos Operacionales", capa: "global", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: "Manual OS10", order: 6, useAsAiKnowledge: true },

  // Capa INSTALACIÓN
  { codigo: "contrato_mandante", nombre: "Contrato con Mandante", capa: "instalacion", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "D.L. 3.607", order: 10 },
  { codigo: "estudio_seguridad", nombre: "Estudio de Seguridad", capa: "instalacion", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "Ley 21.659 Art.15", order: 11 },
  { codigo: "directiva_funcionamiento", nombre: "Directiva de Funcionamiento", capa: "instalacion", obligatorio: true, tieneVencimiento: true, diasAlerta: 90, normativa: "D.S. 93 — Vigencia 3 años", order: 12 },
  { codigo: "nomina_guardias", nombre: "Nómina de Guardias Actualizada", capa: "instalacion", obligatorio: true, tieneVencimiento: false, diasAlerta: 0, normativa: "OS10 Fiscalización", order: 13 },

  // Capa GUARDIA (referencia — mapean a OpsDocumentoPersona.type)
  { codigo: "contrato_guardia", nombre: "Contrato", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 15, normativa: "CT Art.31", order: 20 },
  { codigo: "credencial_os10", nombre: "Credencial OS-10 (Tarjeta)", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 90, normativa: "D.S. 93 Art.18 — Vigencia 3 años", order: 21 },
  { codigo: "certificado_os10", nombre: "Certificado OS-10", capa: "guardia", obligatorio: true, tieneVencimiento: false, diasAlerta: 0, normativa: "D.S. 867 Art.5", order: 22 },
  { codigo: "certificado_antecedentes", nombre: "Certificado de antecedentes", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 15, normativa: "D.S. 867 Art.5 N°4 — Vigencia 30 días", order: 23 },
  { codigo: "examen_psicologico", nombre: "Examen Psicológico", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "D.S. 867 Art.5 N°3", order: 24 },
  { codigo: "registro_capacitacion", nombre: "Registro de Capacitación", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "Manual OS10", order: 25 },
  { codigo: "historial_penal", nombre: "Historial Penal", capa: "guardia", obligatorio: true, tieneVencimiento: true, diasAlerta: 30, normativa: "D.S. 867", order: 26 },

  // Capa NEGOCIO — documentos de licitación (bases / Q&A / anexos)
  { codigo: "bases_licitacion", nombre: "Bases de licitación", capa: "negocio", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 40, useAsAiKnowledge: true },
  { codigo: "qa_licitacion", nombre: "Preguntas y respuestas (Q&A)", capa: "negocio", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 41, useAsAiKnowledge: true },
  { codigo: "anexos_licitacion", nombre: "Anexos de licitación", capa: "negocio", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 42, useAsAiKnowledge: true },

  // Placeholders para ingesta Drive sin tipo (nunca usados para datos legados)
  { codigo: "sin_clasificar", nombre: "Sin clasificar", capa: "global", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 90 },
  { codigo: "sin_clasificar", nombre: "Sin clasificar", capa: "instalacion", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 91 },
  { codigo: "sin_clasificar", nombre: "Sin clasificar", capa: "guardia", obligatorio: false, tieneVencimiento: false, diasAlerta: 0, normativa: null, order: 92 },
];

/** Códigos únicos por capa: sin_clasificar se distingue con sufijo de capa en codigo. */
const TIPOS_SEED = TIPOS_DEFAULT.map((t) =>
  t.codigo === "sin_clasificar"
    ? { ...t, codigo: `sin_clasificar_${t.capa}` }
    : t
);

export async function seedTiposDocOperacional(
  prisma: PrismaClient,
  tenantId: string
) {
  let created = 0;
  for (const t of TIPOS_SEED) {
    const existing = await prisma.tipoDocumento.findUnique({
      where: { tenantId_codigo: { tenantId, codigo: t.codigo } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.tipoDocumento.create({
      data: { tenantId, ...t },
    });
    created++;
  }

  // Upsert idempotente de tipos de licitación (capa negocio) en tenants ya sembrados.
  const LICITACION_TIPOS = TIPOS_SEED.filter((t) => t.capa === "negocio");
  let upserted = 0;
  for (const t of LICITACION_TIPOS) {
    const row = await prisma.tipoDocumento.upsert({
      where: { tenantId_codigo: { tenantId, codigo: t.codigo } },
      create: { tenantId, ...t },
      update: {
        nombre: t.nombre,
        capa: t.capa,
        useAsAiKnowledge: true,
        tieneVencimiento: false,
        isActive: true,
      },
      select: { id: true },
    });
    if (row) upserted++;
  }

  if (created === 0 && upserted === 0) {
    console.log("  ⏭️  TiposDocumento ya existen, saltando");
    return;
  }

  console.log(`  ✅ ${created} tipos de documento creados; ${upserted} tipos de licitación asegurados`);
}
