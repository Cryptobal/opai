import { aiService } from "@/lib/ai-service";
import { clampText } from "@/modules/crm/email/radar-util";

/**
 * Redacta un borrador de follow-up cordial (jamás se envía solo) para recordar
 * un compromiso vencido del cliente. gpt-4o-mini; degrada a un texto genérico.
 */
export async function generateFollowUp(
  tenantId: string,
  input: { que: string; accountName: string },
): Promise<string | null> {
  const prompt = `Redacta un BORRADOR de correo de seguimiento cordial y breve en español chileno neutro para ${input.accountName}. El cliente había quedado de: "${clampText(input.que, 160)}" y aún no responde. Tono amable, sin presionar. Estructura: (1) saludo breve, (2) recordar amablemente el punto pendiente, (3) ofrecer ayuda / preguntar si necesita algo. Máx 80 palabras. Devuelve SOLO el texto del correo, sin asunto ni firma.`;
  try {
    const txt = await aiService.generateText(prompt, { maxTokens: 260, temperature: 0.4 }, { tenantId, feature: "correo-radar-followup" });
    return txt?.trim() || null;
  } catch {
    return null;
  }
}
