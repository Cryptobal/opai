/**
 * Model router for AI Help Chat.
 * Decides between gpt-4o-mini (default, fast, cheap) and gpt-4o (better reasoning)
 * based on retrieval quality, conversation state, and user frustration signals.
 */

const MODEL_DEFAULT = "gpt-4o-mini";
const MODEL_ESCALATED = "gpt-4o";

/** Normalized retrieval score below which we consider evidence weak. */
const RETRIEVAL_WEAK_THRESHOLD = 4;

/** Number of recent fallback responses that triggers escalation. */
const FALLBACK_ESCALATION_COUNT = 2;

const FRUSTRATION_KEYWORDS = [
  "no funciona",
  "no sirve",
  "no entiendo",
  "otra vez",
  "de nuevo",
  "ya te pregunte",
  "ya pregunte",
  "no me ayuda",
  "mala respuesta",
  "no es eso",
  "eso no es",
  "incorrecto",
  "mal",
  "error",
  "no me sirve",
  "sigues sin",
  "sigue sin",
  "no puedo",
];

/**
 * Detect frustration keywords in a user message.
 */
export function detectFrustration(userMessage: string): boolean {
  const lower = userMessage
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return FRUSTRATION_KEYWORDS.some((kw) => lower.includes(kw));
}

type ModelChoice = {
  retrievalMaxScore: number;
  recentFallbackCount: number;
  frustrated: boolean;
};

/**
 * Choose the appropriate model based on context signals.
 *
 * Escalates to gpt-4o when:
 * 1. Retrieval evidence is weak (low scores), OR
 * 2. Multiple recent fallbacks in the conversation, OR
 * 3. User expresses frustration
 */
export function chooseModel(ctx: ModelChoice): string {
  if (ctx.frustrated) return MODEL_ESCALATED;
  if (ctx.recentFallbackCount >= FALLBACK_ESCALATION_COUNT) return MODEL_ESCALATED;
  if (ctx.retrievalMaxScore > 0 && ctx.retrievalMaxScore < RETRIEVAL_WEAK_THRESHOLD) return MODEL_ESCALATED;
  return MODEL_DEFAULT;
}
