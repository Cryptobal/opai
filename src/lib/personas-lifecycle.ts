import type { GuardiaLifecycleStatus } from "@/lib/personas";
import { getLifecycleTransitions } from "@/lib/personas";

/** Motivo de máquina para anular una contratación que nunca inició. */
export const CANCEL_HIRE_REASON = "contratacion_anulada";

export const CANCEL_HIRE_NOTE_OPTIONS = [
  { value: "sspp", label: "SSPP / se arrepintió" },
  { value: "no_se_presento", label: "No se presentó" },
  { value: "otro", label: "Otro" },
] as const;

export type CancelHireBlockCode = "not_contratado" | "signed_contract" | "has_work";

export type CancelHireEligibility = {
  eligible: boolean;
  reason: string | null;
  code: CancelHireBlockCode | null;
};

const SIGNED_LABOR_SIGNATURE_STATUSES = new Set(["completed", "external"]);

export type ContractTypeValue = "indefinido" | "plazo_fijo";

export type HireContractFields = {
  contractType: ContractTypeValue;
  startDate: string;
  period1End: string;
  period2End: string;
};

export const EMPTY_HIRE_CONTRACT: HireContractFields = {
  contractType: "indefinido",
  startDate: "",
  period1End: "",
  period2End: "",
};

export function isAllowedLifecycleTransition(
  from: string,
  to: string,
  options?: { reason?: string | null },
): boolean {
  const current = from.toLowerCase();
  const next = to.toLowerCase();
  if (current === next) return true;
  if (current === "contratado" && next === "inactivo") {
    return options?.reason === CANCEL_HIRE_REASON;
  }
  return getLifecycleTransitions(current).includes(next as GuardiaLifecycleStatus);
}

/** Contrato laboral generado en Documentos y firmado (digital o marca externa). */
export function isSignedLaborContractDocument(doc: {
  category?: string | null;
  signatureStatus?: string | null;
  signedAt?: Date | string | null;
}): boolean {
  if ((doc.category ?? "").toLowerCase() !== "contrato_laboral") return false;
  if (doc.signedAt) return true;
  const status = (doc.signatureStatus ?? "").toLowerCase();
  return SIGNED_LABOR_SIGNATURE_STATUSES.has(status);
}

/** Inactivación administrativa (sin finiquito), no una desvinculación laboral. */
export function isCancelledHireRecord(input: {
  terminationReason?: string | null;
}): boolean {
  return input.terminationReason === CANCEL_HIRE_REASON;
}

export function canCancelHireFromCounts(input: {
  lifecycleStatus: string;
  marcaciones: number;
  liquidaciones: number;
  signedLaborContracts?: number;
}): CancelHireEligibility {
  if (input.lifecycleStatus.toLowerCase() !== "contratado") {
    return {
      eligible: false,
      reason: "Solo se puede anular una contratación activa.",
      code: "not_contratado",
    };
  }
  if ((input.signedLaborContracts ?? 0) > 0) {
    return {
      eligible: false,
      reason:
        "Hay un contrato laboral firmado. Debes registrar un finiquito en la pestaña Contractual → Eventos.",
      code: "signed_contract",
    };
  }
  if (input.marcaciones > 0 || input.liquidaciones > 0) {
    return {
      eligible: false,
      reason: "Debe finiquitarse; ya hay registro de trabajo (marcaciones o liquidaciones).",
      code: "has_work",
    };
  }
  return { eligible: true, reason: null, code: null };
}

export function toHireContractApiPayload(input: HireContractFields) {
  return {
    effectiveAt: input.startDate,
    contractType: input.contractType,
    contractStartDate: input.startDate,
    contractPeriod1End: input.contractType === "plazo_fijo" ? input.period1End || null : null,
    contractPeriod2End: input.contractType === "plazo_fijo" ? input.period2End || null : null,
  };
}

export function validateHireContractFields(input: HireContractFields): string | null {
  if (!input.startDate) return "Selecciona la fecha de inicio de contrato";
  if (input.contractType === "plazo_fijo") {
    if (!input.period1End) return "Indica la fecha de término del 1er plazo";
    if (input.period1End < input.startDate) {
      return "El 1er plazo no puede ser anterior al inicio";
    }
    if (input.period2End && input.period2End < input.period1End) {
      return "El 2do plazo no puede ser anterior al 1er plazo";
    }
  }
  return null;
}

export function computeFiniquitoSettlement(input: {
  vacationPaymentAmount?: number | null;
  pendingRemunerationAmount?: number | null;
  yearsOfServiceAmount?: number | null;
  substituteNoticeAmount?: number | null;
  afcDeductionAmount?: number | null;
}): number {
  const haberes =
    toNonNegativeAmount(input.vacationPaymentAmount) +
    toNonNegativeAmount(input.pendingRemunerationAmount) +
    toNonNegativeAmount(input.yearsOfServiceAmount) +
    toNonNegativeAmount(input.substituteNoticeAmount);
  const descuento = toNonNegativeAmount(input.afcDeductionAmount);
  return Math.max(0, haberes - descuento);
}

export function toNonNegativeAmount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function isClosingInstallationStatus(
  fromStatus: string,
  toStatus: string | undefined | null,
): boolean {
  if (!toStatus || toStatus === fromStatus) return false;
  return fromStatus === "active" && toStatus !== "active";
}
