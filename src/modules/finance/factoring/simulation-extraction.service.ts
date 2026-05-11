/**
 * Extracción de campos económicos desde el PDF de simulación que envía
 * el factoring. Llama al provider de IA configurado (vía aiService) y
 * devuelve un objeto con los montos extraídos.
 *
 * Distintos factorings usan distintos nombres para los mismos conceptos
 * (Capital Express: "Dif. Precio"; otros: "Interés" o "Costo financiero").
 * El prompt enumera sinónimos para tolerar formatos heterogéneos. Si un
 * campo no aparece en el PDF, viene null.
 */

import "server-only";
import { aiService } from "@/lib/ai-service";

export interface ExtractedSimulation {
  /** Monto bruto de los documentos cedidos. */
  montoBruto: number | null;
  /** Porcentaje de anticipo aplicado (0-100). */
  porcAnticipo: number | null;
  /** Anticipo bruto antes de descontar intereses. */
  anticipoBruto: number | null;
  /** "Diferencia de precio" = interés en CLP cobrado por el plazo. */
  difPrecio: number | null;
  /** Anticipo neto = anticipo bruto − dif precio. */
  anticipoNeto: number | null;
  /** Comisión fija del factoring en CLP. */
  comision: number | null;
  /** IVA sobre la comisión (típicamente 19%). */
  iva: number | null;
  /** Gastos legales/notariales si vienen separados. */
  gastosLegal: number | null;
  notaria: number | null;
  gastosOperacionales: number | null;
  /** Monto final que el factoring deposita al cedente. */
  montoAGirar: number | null;
  /** Confianza global de extracción (0-1) reportada por el modelo. */
  confidence: number | null;
  /** Notas que el modelo quiera devolver para diagnóstico (sin PII). */
  notes: string | null;
}

const EXTRACTION_PROMPT = `Eres un extractor de datos financieros. El PDF adjunto es una "simulación de operación" enviada por una empresa de factoring chilena a su cliente cedente.

Extrae los siguientes campos en pesos chilenos (CLP) sin decimales. Si un campo no aparece en el documento, devuelve null para ese campo — NO inventes valores.

Campos (con sinónimos comunes a tolerar):
- montoBruto: "Monto Doctos", "Total Bruto", "Monto Bruto", "Valor Bruto Factura(s)"
- porcAnticipo: "Porc. Anticipo", "% Anticipo", "Anticipo (%)" — número 0-100
- anticipoBruto: "Monto Antic. Bruto", "Anticipo Bruto"
- difPrecio: "Dif. Precio", "Diferencia de Precio", "Interés", "Costo Financiero", "Intereses"
- anticipoNeto: "Antic. Neto", "Anticipo Neto"
- comision: "Comisión", "Comisión Factoring"
- iva: "I.V.A.", "IVA", "IVA Comisión"
- gastosLegal: "Gasto Legal", "Gastos Legales"
- notaria: "Notaría", "Gastos Notariales"
- gastosOperacionales: "Gtos. Operacionales", "Gastos Operacionales"
- montoAGirar: "Monto a Girar", "Neto a Girar", "Total a Pagar", "Valor Líquido"

Reglas adicionales:
1. Si el PDF contiene varias operaciones en una tabla (cesión de N facturas en un mismo documento), reporta los TOTALES de la operación completa, no de una sola fila.
2. Si el monto bruto y el "monto a girar" no aparecen explícitos pero se pueden derivar de los otros campos, calcúlalos y márcalo en "notes".
3. "confidence" debe ser un valor 0-1 que refleje cuánto te crees la extracción (1 = todos los campos clave aparecen explícitos; 0.5 = derivados o ambiguos; <0.3 = el PDF probablemente no es una simulación de factoring).
4. "notes" puede ser una observación corta para el usuario; ej: "campos derivados desde anticipo neto y comisión" o "PDF parece factura, no simulación".

Devuelve EXACTAMENTE este JSON (sin markdown, sin texto extra):
{
  "montoBruto": number | null,
  "porcAnticipo": number | null,
  "anticipoBruto": number | null,
  "difPrecio": number | null,
  "anticipoNeto": number | null,
  "comision": number | null,
  "iva": number | null,
  "gastosLegal": number | null,
  "notaria": number | null,
  "gastosOperacionales": number | null,
  "montoAGirar": number | null,
  "confidence": number,
  "notes": string | null
}`;

function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v.slice(0, 500) : null;
}

/**
 * Llama al proveedor IA con el PDF y normaliza el JSON devuelto al
 * shape `ExtractedSimulation`. Si el provider falla o el JSON viene
 * malformado, propaga el error — el caller decide cómo reaccionar
 * (típicamente: dejar todos los campos vacíos para edición manual).
 */
export async function extractFactoringSimulation(
  pdfBase64: string,
  ctx: { tenantId: string },
): Promise<ExtractedSimulation> {
  const raw = (await aiService.processDocument(
    pdfBase64,
    EXTRACTION_PROMPT,
    2048,
    ctx,
  )) as Record<string, unknown>;

  return {
    montoBruto: coerceNumber(raw.montoBruto),
    porcAnticipo: coerceNumber(raw.porcAnticipo),
    anticipoBruto: coerceNumber(raw.anticipoBruto),
    difPrecio: coerceNumber(raw.difPrecio),
    anticipoNeto: coerceNumber(raw.anticipoNeto),
    comision: coerceNumber(raw.comision),
    iva: coerceNumber(raw.iva),
    gastosLegal: coerceNumber(raw.gastosLegal),
    notaria: coerceNumber(raw.notaria),
    gastosOperacionales: coerceNumber(raw.gastosOperacionales),
    montoAGirar: coerceNumber(raw.montoAGirar),
    confidence: coerceNumber(raw.confidence),
    notes: coerceString(raw.notes),
  };
}
