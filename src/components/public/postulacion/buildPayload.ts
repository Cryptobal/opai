import { normalizeMobileNineDigits, normalizeRut } from "@/lib/personas";
import type { PostulacionForm, UploadedDoc } from "./types";

interface BuildPayloadArgs {
  token: string;
  form: PostulacionForm;
  completedRut: string;
  healthSystem: string;
  isapreHasExtraPercent: boolean;
  uploadedDocs: UploadedDoc[];
}

/**
 * Construye el body del POST /api/public/[tenantSlug]/postulacion.
 * Idéntico al payload histórico del formulario de una sola pantalla:
 * ningún campo cambia de nombre, tipo ni transformación.
 */
export function buildPostulacionPayload({
  token,
  form,
  completedRut,
  healthSystem,
  isapreHasExtraPercent,
  uploadedDocs,
}: BuildPayloadArgs) {
  return {
    token,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    rut: normalizeRut(completedRut),
    email: form.email.trim(),
    phoneMobile: normalizeMobileNineDigits(form.phoneMobile),
    addressFormatted: form.addressFormatted.trim(),
    googlePlaceId: form.googlePlaceId,
    commune: form.commune.trim() || null,
    city: form.city.trim() || null,
    region: form.region.trim() || null,
    lat: form.lat,
    lng: form.lng,
    birthDate: form.birthDate,
    sex: form.sex,
    nacionalidad: form.nacionalidad || "Chile",
    afp: form.afp,
    healthSystem,
    isapreName: healthSystem === "isapre" ? form.isapreName : null,
    isapreHasExtraPercent: healthSystem === "isapre" ? isapreHasExtraPercent : false,
    isapreExtraPercent:
      healthSystem === "isapre" && isapreHasExtraPercent ? form.isapreExtraPercent : null,
    hasMobilization: form.hasMobilization === "si",
    availableExtraShifts: form.availableExtraShifts === "si",
    shoeSize: form.shoeSize || null,
    pantsSize: form.pantsSize || null,
    tshirtSize: form.tshirtSize || null,
    shirtSize: form.shirtSize || null,
    geologoSize: form.geologoSize || null,
    polarSize: form.polarSize || null,
    jacketSize: form.jacketSize || null,
    heightCm: form.heightCm ? Number(form.heightCm) : null,
    weightKg: form.weightKg ? Number(form.weightKg) : null,
    bankCode: form.bankCode,
    accountType: form.accountType,
    accountNumber: form.accountNumber.trim(),
    notes: form.notes.trim() || null,
    documents: uploadedDocs.map((doc) => ({ type: doc.type, fileUrl: doc.fileUrl })),
  };
}
