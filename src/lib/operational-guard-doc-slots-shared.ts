/**
 * Tipos y helpers puros para slots normativos de guardia (sin Prisma).
 * Importable desde Client Components.
 */

import { DOCUMENT_TYPES } from "@/lib/personas";
import { GUARDIA_TIPO_MAP } from "@/lib/docs-operacionales";

export type OperationalGuardDocSlot = {
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  order: number;
  personaTypes: string[];
};

export const FALLBACK_GUARD_TIPOS: Array<{
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  order: number;
}> = [
  {
    codigo: "contrato_guardia",
    nombre: "Contrato",
    normativa: "CT Art.31",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 15,
    order: 20,
  },
  {
    codigo: "credencial_os10",
    nombre: "Credencial OS-10 (Tarjeta)",
    normativa: "D.S. 93 Art.18 — Vigencia 3 años",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 90,
    order: 21,
  },
  {
    codigo: "certificado_os10",
    nombre: "Certificado OS-10",
    normativa: "D.S. 867 Art.5",
    obligatorio: true,
    tieneVencimiento: false,
    diasAlerta: 0,
    order: 22,
  },
  {
    codigo: "certificado_antecedentes",
    nombre: "Certificado de antecedentes",
    normativa: "D.S. 867 Art.5 N°4 — Vigencia 30 días",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 15,
    order: 23,
  },
  {
    codigo: "examen_psicologico",
    nombre: "Examen Psicológico",
    normativa: "D.S. 867 Art.5 N°3",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 30,
    order: 24,
  },
  {
    codigo: "registro_capacitacion",
    nombre: "Registro de Capacitación",
    normativa: "Manual OS10",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 30,
    order: 25,
  },
  {
    codigo: "historial_penal",
    nombre: "Historial Penal",
    normativa: "D.S. 867",
    obligatorio: true,
    tieneVencimiento: true,
    diasAlerta: 30,
    order: 26,
  },
];

export function personaTypesForOperationalCodigo(codigo: string): string[] {
  return GUARDIA_TIPO_MAP[codigo] ?? [codigo];
}

/** Primer tipo OpsDocumentoPersona válido para subir desde la ficha */
export function pickPersonaTypeForSlot(personaTypes: string[]): string | null {
  const allowed = DOCUMENT_TYPES as readonly string[];
  for (const t of personaTypes) {
    if (allowed.includes(t)) return t;
  }
  return null;
}

export function slotIsUploadable(personaTypes: string[]): boolean {
  return pickPersonaTypeForSlot(personaTypes) !== null;
}
