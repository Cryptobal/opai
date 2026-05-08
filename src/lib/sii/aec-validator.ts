/**
 * Validador estructural del AEC firmado (mérito ejecutivo Ley 19.983).
 *
 * El AEC sirve como instrumento de mérito ejecutivo SOLO si contiene:
 *   - el wrapper `<DocumentoAEC>` (estructura mínima)
 *   - al menos una firma `<Signature>` (so que sea verificable)
 *   - un `<DeclaracionJurada>` (texto Ley 19.983 art. 9) **O** un
 *     recibo electrónico (`<EnvioRecibos>` / `<MnsjRecibo>` /
 *     `<DeclJurada>` legacy).
 *
 * Sin esto, el factoring NO puede cobrar al deudor en sede ejecutiva
 * (caso típico: AEC generado por un proveedor que omitió la
 * declaración jurada o el recibo).
 *
 * Esta función se usa tanto desde el adapter SimpleAPI (`simpleapi-cesion`)
 * — donde el AEC lo construye SimpleAPI y puede venir con cualquier
 * combinación — como desde el adapter directo SII (`sii-direct-cesion`),
 * donde nuestro propio builder siempre incluye `<DeclaracionJurada>`.
 */

export type AecValidatorResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Valida que el AEC cumpla los requisitos mínimos para tener mérito
 * ejecutivo según Ley 19.983. Trabaja sobre el bytes del AEC en
 * encoding ISO-8859-1 (lo que devuelven SimpleAPI y nuestro signer).
 */
export function validateAecMeritoEjecutivo(aecXml: Buffer): AecValidatorResult {
  const aecText = aecXml.toString("latin1");
  if (!aecText.includes("DocumentoAEC")) {
    return { ok: false, error: "AEC sin <DocumentoAEC> (estructura inválida)" };
  }
  if (!aecText.includes("Signature")) {
    return { ok: false, error: "AEC sin <Signature> (no firmado)" };
  }
  const hasReciboElec =
    aecText.includes("<EnvioRecibos>") || aecText.includes("<MnsjRecibo>");
  const hasDeclaracionJurada =
    aecText.includes("DeclaracionJurada") || aecText.includes("<DeclJurada>");
  if (!hasReciboElec && !hasDeclaracionJurada) {
    return {
      ok: false,
      error:
        "AEC generado SIN declaración jurada ni recibo electrónico. " +
        "Esto invalida el mérito ejecutivo (Ley 19.983) — el factoring " +
        "no podría cobrar al deudor. Verificar config del proveedor o " +
        "agregar declaración jurada manualmente al payload.",
    };
  }
  return { ok: true };
}
