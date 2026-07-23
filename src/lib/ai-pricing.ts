/**
 * AI Pricing Registry
 *
 * Precios de referencia por modelo, en USD por 1.000.000 de tokens
 * (entrada / salida). Se usa para estimar el costo del consumo registrado en
 * `AiUsageLog`, ya que la mayoría de los features NO devuelven costo real
 * (solo tokens, muchas veces estimados ~4 chars/token).
 *
 * ⚠️ Estos precios son de REFERENCIA para dimensionar el gasto dentro de OPAI.
 * La fuente de verdad de facturación siguen siendo los dashboards de cada
 * proveedor (OpenAI / Anthropic / Google). Actualizar acá cuando cambien.
 *
 * Última actualización: 2026-07-23
 *  - Anthropic: precios oficiales vigentes.
 *  - OpenAI / Google: precios públicos aproximados — verificar en la página
 *    de precios del proveedor.
 */

export type ModelPrice = {
  /** USD por 1M tokens de entrada. */
  inputPerM: number;
  /** USD por 1M tokens de salida. 0 para modelos de solo-embedding. */
  outputPerM: number;
  /**
   * true cuando el costo NO se puede derivar de tokens (ej: Whisper cobra por
   * minuto de audio). Se excluye del costo estimado pero se muestran requests.
   */
  tokenPricingNA?: boolean;
  /** Nota mostrada en la UI (ej. "aprox", "por minuto"). */
  note?: string;
};

/**
 * Precios por `modelId` canónico. La resolución hace match exacto y, si no,
 * por prefijo (para tolerar sufijos de fecha como `-20251001`).
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // ── OpenAI (aprox, verificar) ──
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4.1-mini": { inputPerM: 0.4, outputPerM: 1.6 },
  "gpt-4.1": { inputPerM: 2.0, outputPerM: 8 },
  "o3-mini": { inputPerM: 1.1, outputPerM: 4.4 },
  "text-embedding-3-small": { inputPerM: 0.02, outputPerM: 0 },
  "text-embedding-3-large": { inputPerM: 0.13, outputPerM: 0 },
  "whisper-1": { inputPerM: 0, outputPerM: 0, tokenPricingNA: true, note: "por minuto de audio" },

  // ── Anthropic (precios oficiales vigentes) ──
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
  "claude-sonnet-4-5": { inputPerM: 3, outputPerM: 15 },
  "claude-opus-4-5": { inputPerM: 5, outputPerM: 25 },
  "claude-sonnet-4": { inputPerM: 3, outputPerM: 15 },
  "claude-3-5-haiku": { inputPerM: 0.8, outputPerM: 4 },
  "claude-3-haiku": { inputPerM: 0.25, outputPerM: 1.25 },

  // ── Google (aprox, verificar) ──
  "gemini-2.0-flash": { inputPerM: 0.1, outputPerM: 0.4 },
  "gemini-2.0-pro": { inputPerM: 1.25, outputPerM: 5, note: "aprox" },
  "gemini-2.5-pro-preview": { inputPerM: 1.25, outputPerM: 10, note: "aprox" },
};

/**
 * Resuelve el precio de un modelo. Primero match exacto; si no, por prefijo
 * (para tolerar sufijos de fecha, ej. `claude-haiku-4-5-20251001`).
 */
export function priceFor(model: string): ModelPrice | null {
  if (!model) return null;
  if (MODEL_PRICES[model]) return MODEL_PRICES[model];

  // Match por prefijo: el modelId más largo que sea prefijo del modelo dado.
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(MODEL_PRICES)) {
    if (model.startsWith(key) && (!best || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

export type CostResult = {
  /** Costo estimado en USD. 0 si el modelo no está tarifado o es NA. */
  usd: number;
  /** true si se pudo estimar el costo a partir de tokens. */
  priced: boolean;
};

/**
 * Estima el costo en USD a partir de tokens de entrada/salida y el modelo.
 */
export function computeCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostResult {
  const price = priceFor(model);
  if (!price || price.tokenPricingNA) {
    return { usd: 0, priced: false };
  }
  const usd =
    (inputTokens / 1_000_000) * price.inputPerM +
    (outputTokens / 1_000_000) * price.outputPerM;
  return { usd, priced: true };
}
