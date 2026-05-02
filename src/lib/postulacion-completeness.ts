/**
 * Determina si la ficha de un guardia/postulante está completa con los datos
 * mínimos para operar. Útil para marcar visualmente las fichas creadas vía
 * formulario express público (que entran con datos mínimos) y diferenciarlas
 * de las cargadas en backoffice.
 */

export type ProfileCompletenessInput = {
  persona: {
    birthDate?: Date | string | null;
    sex?: string | null;
    addressFormatted?: string | null;
    afp?: string | null;
    healthSystem?: string | null;
  };
  hasBankAccount: boolean;
  hasAnyDocument: boolean;
};

export type ProfileCompleteness = {
  complete: boolean;
  missing: string[];
};

const FIELD_LABELS: Record<string, string> = {
  birthDate: "fecha de nacimiento",
  sex: "sexo",
  addressFormatted: "dirección",
  afp: "AFP",
  healthSystem: "sistema de salud",
  bankAccount: "cuenta bancaria",
  documents: "documentos",
};

export function computeProfileCompleteness(
  input: ProfileCompletenessInput
): ProfileCompleteness {
  const missing: string[] = [];
  const p = input.persona;

  if (!p.birthDate) missing.push(FIELD_LABELS.birthDate);
  if (!p.sex) missing.push(FIELD_LABELS.sex);
  if (!p.addressFormatted) missing.push(FIELD_LABELS.addressFormatted);
  if (!p.afp) missing.push(FIELD_LABELS.afp);
  if (!p.healthSystem) missing.push(FIELD_LABELS.healthSystem);
  if (!input.hasBankAccount) missing.push(FIELD_LABELS.bankAccount);
  if (!input.hasAnyDocument) missing.push(FIELD_LABELS.documents);

  return {
    complete: missing.length === 0,
    missing,
  };
}
