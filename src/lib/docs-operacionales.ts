/**
 * Helpers para documentos operacionales (OS10 / DT)
 */

/** Calcula el status de un documento basado en su expiresAt y diasAlerta del tipo */
export function calcDocStatus(
  expiresAt: Date | null | undefined,
  tieneVencimiento: boolean,
  diasAlerta: number
): "vigente" | "por_vencer" | "vencido" | "no_aplica" {
  if (!tieneVencimiento || !expiresAt) return "no_aplica";

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const exp = new Date(expiresAt);
  const alertDate = new Date(exp);
  alertDate.setUTCDate(alertDate.getUTCDate() - diasAlerta);

  if (exp <= today) return "vencido";
  if (alertDate <= today) return "por_vencer";
  return "vigente";
}

/** Mapeo tipo catálogo guardia → tipos OpsDocumentoPersona.type */
export const GUARDIA_TIPO_MAP: Record<string, string[]> = {
  contrato_guardia: ["contrato", "contrato_firmado"],
  credencial_os10: ["credencial_os10", "certificado_os10"],
  certificado_antecedentes: ["certificado_antecedentes"],
  examen_psicologico: ["examen_psicologico"],
  registro_capacitacion: ["registro_capacitacion"],
};

/** Labels legibles para status */
export const DOC_STATUS_LABELS: Record<string, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  no_aplica: "Sin vencimiento",
  sin_documento: "Sin documento",
};
