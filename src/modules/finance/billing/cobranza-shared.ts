/** Slugs de plantilla de cobranza (DocTemplate usageSlug). */
export type CobranzaSlug =
  | "cobranza_amable"
  | "cobranza_firme"
  | "cobranza_prejudicial";

export type CobranzaChannel = "whatsapp" | "email" | "both";

/** Sugiere tono según días de mora contractual. */
export function suggestCobranzaSlug(daysOverdue: number): CobranzaSlug {
  if (daysOverdue <= 7) return "cobranza_amable";
  if (daysOverdue <= 30) return "cobranza_firme";
  return "cobranza_prejudicial";
}

export function cobranzaSlugLabel(slug: CobranzaSlug): string {
  if (slug === "cobranza_amable") return "Amable";
  if (slug === "cobranza_firme") return "Firme";
  return "Pre-judicial";
}
