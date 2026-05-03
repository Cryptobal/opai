/**
 * Seed: Tipos de documentos operacionales (normativa OS10 / DT)
 * Crea el catálogo de tipos por defecto para las 3 capas.
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
];

export async function seedTiposDocOperacional(
  prisma: PrismaClient,
  tenantId: string
) {
  const existing = await prisma.tipoDocOperacional.findFirst({
    where: { tenantId },
  });
  if (existing) {
    console.log("  ⏭️  TiposDocOperacional ya existen, saltando");
    return;
  }

  await prisma.tipoDocOperacional.createMany({
    data: TIPOS_DEFAULT.map((t) => ({
      tenantId,
      ...t,
    })),
  });

  console.log(`  ✅ ${TIPOS_DEFAULT.length} tipos de doc operacional creados`);
}
