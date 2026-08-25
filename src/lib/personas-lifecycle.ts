import type { GuardiaLifecycleStatus } from "@/lib/personas";
import { getLifecycleTransitions } from "@/lib/personas";

/** Motivo de máquina para anular una contratación que nunca inició. */
export const CANCEL_HIRE_REASON = "contratacion_anulada";

export const CANCEL_HIRE_NOTE_OPTIONS = [
  { value: "sspp", label: "SSPP / se arrepintió" },
  { value: "no_se_presento", label: "No se presentó" },
  { value: "otro", label: "Otro" },
] as const;

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

export function canCancelHireFromCounts(input: {
  lifecycleStatus: string;
  marcaciones: number;
  liquidaciones: number;
}): { eligible: boolean; reason: string | null } {
  if (input.lifecycleStatus.toLowerCase() !== "contratado") {
    return { eligible: false, reason: "Solo se puede anular una contratación activa." };
  }
  if (input.marcaciones > 0 || input.liquidaciones > 0) {
    return {
      eligible: false,
      reason: "Debe finiquitarse; ya hay registro de trabajo.",
    };
  }
  return { eligible: true, reason: null };
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
