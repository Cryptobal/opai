/**
 * Defaults planos para merge en `/api/crm/whatsapp-templates` (CrmWhatsAppTemplate).
 * Los cuerpos coinciden con {@link WA_TEMPLATE_SEEDS}; los tokens se extraen del texto.
 */

import { WA_TEMPLATE_SEEDS } from "@/lib/docs/wa-template-seeds";

function tokensFromPlain(text: string): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    keys.add(m[1].trim());
  }
  return [...keys].sort();
}

export type WaTemplateDefaultDef = {
  name: string;
  body: string;
  tokens: string[];
};

export const WA_TEMPLATE_DEFAULTS: Record<string, WaTemplateDefaultDef> = Object.fromEntries(
  WA_TEMPLATE_SEEDS.map((s) => [
    s.slug,
    { name: s.name, body: s.body, tokens: tokensFromPlain(s.body) },
  ]),
);
