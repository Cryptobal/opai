import {
  completeRutWithDv,
  isChileanRutFormat,
  isValidChileanRut,
  isValidMobileNineDigits,
} from "@/lib/personas";
import type { DocTypeConfig, PostulacionForm, UploadedDoc } from "./types";

export interface ValidationContext {
  healthSystem: string;
  isapreHasExtraPercent: boolean;
  uploadedDocs: UploadedDoc[];
  documentTypes: DocTypeConfig[];
}

export interface StepValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

export interface SubmitValidationError {
  message: string;
  field?: "rut";
}

/**
 * Red de seguridad final: replica la validación completa histórica de
 * handleSubmit. Devuelve el primer error encontrado o null si todo es válido.
 */
export function validateSubmit(
  form: PostulacionForm,
  ctx: ValidationContext,
): SubmitValidationError | null {
  const requiredCodes = ctx.documentTypes.filter((d) => d.required).map((d) => d.code);
  const uploadedTypes = new Set(ctx.uploadedDocs.map((d) => d.type));
  const missing = requiredCodes.filter((code) => !uploadedTypes.has(code));
  if (missing.length > 0) {
    const names = missing
      .map((code) => ctx.documentTypes.find((d) => d.code === code)?.label ?? code)
      .join(", ");
    return { message: `Faltan documentos obligatorios: ${names}` };
  }
  if (
    !form.firstName.trim() ||
    !form.lastName.trim() ||
    !form.rut.trim() ||
    !form.email.trim() ||
    !form.phoneMobile.trim() ||
    !form.addressFormatted.trim() ||
    !form.googlePlaceId ||
    !form.birthDate ||
    !form.sex ||
    !form.afp ||
    !form.bankCode ||
    !form.accountType ||
    !form.accountNumber.trim() ||
    ctx.uploadedDocs.length === 0
  ) {
    return { message: "Completa todos los campos obligatorios" };
  }
  if (ctx.healthSystem === "isapre" && !form.isapreName) {
    return { message: "Debes seleccionar Isapre" };
  }
  if (
    ctx.healthSystem === "isapre" &&
    ctx.isapreHasExtraPercent &&
    Number(form.isapreExtraPercent || 0) <= 7
  ) {
    return { message: "Si cotiza sobre 7%, indica un porcentaje mayor a 7" };
  }
  const completedRut = completeRutWithDv(form.rut);
  if (!isChileanRutFormat(completedRut) || !isValidChileanRut(completedRut)) {
    return { message: "Corrige el RUT antes de enviar", field: "rut" };
  }
  return null;
}

/**
 * Valida los campos obligatorios de un paso reutilizando los helpers de
 * @/lib/personas y las mismas reglas del schema Zod del endpoint.
 * No reemplaza la validación final de handleSubmit (red de seguridad).
 */
export function validateStep(
  step: number,
  form: PostulacionForm,
  ctx: ValidationContext,
): StepValidationResult {
  const errors: Record<string, string> = {};

  if (step === 0) {
    if (!form.firstName.trim()) errors.firstName = "Ingresa tu nombre.";
    if (!form.lastName.trim()) errors.lastName = "Ingresa tu apellido.";
    const completedRut = completeRutWithDv(form.rut);
    if (!form.rut.trim()) {
      errors.rut = "Ingresa tu RUT.";
    } else if (!isChileanRutFormat(completedRut) || !isValidChileanRut(completedRut)) {
      errors.rut = "RUT inválido. Verifica guión y dígito verificador.";
    }
    if (!form.birthDate) errors.birthDate = "Ingresa tu fecha de nacimiento.";
    if (!form.sex) errors.sex = "Selecciona tu sexo.";
  }

  if (step === 1) {
    if (!form.phoneMobile.trim()) errors.phoneMobile = "Ingresa tu celular.";
    else if (!isValidMobileNineDigits(form.phoneMobile))
      errors.phoneMobile = "Celular inválido (9 dígitos, comienza en 9).";
    if (!form.email.trim()) errors.email = "Ingresa tu email.";
    if (!form.addressFormatted.trim() || !form.googlePlaceId)
      errors.addressFormatted = "Selecciona una dirección de la lista de sugerencias.";
  }

  if (step === 2) {
    if (!form.afp) errors.afp = "Selecciona tu AFP.";
    if (ctx.healthSystem === "isapre" && !form.isapreName) errors.isapreName = "Selecciona tu Isapre.";
    if (
      ctx.healthSystem === "isapre" &&
      ctx.isapreHasExtraPercent &&
      Number(form.isapreExtraPercent || 0) <= 7
    ) {
      errors.isapreExtraPercent = "Si cotiza sobre 7%, indica un porcentaje mayor a 7.";
    }
    if (!form.bankCode) errors.bankCode = "Selecciona tu banco.";
    if (!form.accountType) errors.accountType = "Selecciona el tipo de cuenta.";
    if (!form.accountNumber.trim()) errors.accountNumber = "Ingresa el número de cuenta.";
  }

  if (step === 4) {
    const requiredCodes = ctx.documentTypes.filter((d) => d.required).map((d) => d.code);
    const uploadedTypes = new Set(ctx.uploadedDocs.map((d) => d.type));
    const missing = requiredCodes.filter((code) => !uploadedTypes.has(code));
    if (missing.length > 0) {
      const names = missing
        .map((code) => ctx.documentTypes.find((d) => d.code === code)?.label ?? code)
        .join(", ");
      errors.documents = `Faltan documentos obligatorios: ${names}`;
    } else if (ctx.uploadedDocs.length === 0) {
      errors.documents = "Debes subir al menos un documento.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
