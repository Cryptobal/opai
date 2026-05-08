/**
 * SII RTC AEC signer.
 *
 * Aplica las 3 firmas XMLDSig que el AEC requiere al XML producido por
 * `aec-builder.ts`. Delega el signing a `aec_signer.py` (libxmlsec1) para
 * garantizar que el C14N sea compatible con el verificador del SII.
 *
 * Cada firma usa:
 *   - SignatureMethod: RSA-SHA1
 *   - DigestMethod:    SHA1
 *   - Canonicalization: Inclusive C14N 1.0 sin comentarios
 *   - Reference URI="" + transform enveloped-signature
 *   - KeyInfo con X509Data/X509Certificate
 *
 * Las 3 firmas se aplican en orden:
 *   1. Sobre <DTECedido>      → Signature insertada al final de DTECedido
 *   2. Sobre <Cesion>         → Signature insertada al final de Cesion
 *   3. Sobre <AEC> (raíz)     → Signature insertada al final de AEC
 *
 * Cada firma cubre el documento completo (URI="") menos la firma actual
 * (transform enveloped-signature), por lo que Cesion incluye en su digest
 * la firma de DTECedido, y AEC incluye las firmas de DTECedido y Cesion.
 *
 * NOTA: Se usa Python/libxmlsec1 en lugar de xml-crypto porque xml-crypto
 * produce un C14N de SignedInfo (600 bytes) que difiere del C14N que
 * libxmlsec1/lxml producen (636 bytes con xmlns="" en los elementos de
 * Reference dentro de <Signature xmlns="xmldsig">). El SII verifica con el
 * C14N de libxmlsec1, por lo que el SignatureValue de xml-crypto era inválido.
 */

import path from "path";
import { spawnSync } from "child_process";

/** Input del signer — XML producido por buildUnsignedAec + cert PFX. */
export interface SignAecInput {
  /** XML sin firmar producido por `buildUnsignedAec` (con placeholders SIG_*). */
  unsignedXml: string;
  /** Buffer del certificado .pfx descifrado del tenant. */
  pfxBuffer: Buffer;
  /** Password del .pfx descifrado. */
  pfxPassword: string;
  /**
   * Si es `true`, NO se re-firma la firma interna del DTE (preserva la firma
   * original del SII tal como vino). Útil cuando el DTE ya viene con firma
   * válida y se quiere evitar reemplazarla por una nueva.
   *
   * Default: `false` (se re-firma para que sea válida en el contexto del AEC,
   * que tiene xmlns + xmlns:xsi heredados que el DTE original no tenía).
   */
  noRefixDteSig?: boolean;
}

/**
 * Aplica las 3 firmas XMLDSig al AEC usando Python/libxmlsec1 y devuelve
 * el XML final firmado, listo para enviar al SII vía RTCAnotEnvio.cgi.
 *
 * Orden crítico:
 *   1. Sign DTECedido      (innermost, no incluye otras firmas)
 *   2. Sign Cesion         (incluye en digest la firma de DTECedido)
 *   3. Sign AEC (raíz)     (incluye en digest las 2 firmas previas)
 *
 * El SII valida las 3 firmas. Si una falla, rechaza con RFS/RDC y la
 * cesión no se anota en el RPETC.
 */
export function signAec(input: SignAecInput): string {
  const scriptPath = path.join(__dirname, "aec_signer.py");
  const pfxB64 = input.pfxBuffer.toString("base64");

  // Convertir XML a Buffer ISO-8859-1 para pasar a Python por stdin
  const xmlBuffer = Buffer.from(input.unsignedXml, "latin1");

  const pythonArgs = [
    scriptPath,
    "--pfx",
    pfxB64,
    "--password",
    input.pfxPassword,
  ];
  if (input.noRefixDteSig) pythonArgs.push("--no-refix-dte-sig");

  const result = spawnSync("python3", pythonArgs, {
    input: xmlBuffer,
    maxBuffer: 10 * 1024 * 1024, // 10 MB
    timeout: 30_000,
  });

  if (result.error) {
    throw new Error(
      `aec_signer.py: error al lanzar proceso Python: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") ?? "";
    throw new Error(
      `aec_signer.py: proceso terminó con código ${result.status}. stderr: ${stderr.slice(0, 500)}`,
    );
  }

  // stdout es el XML firmado en ISO-8859-1
  const signedBuffer = result.stdout as Buffer;
  if (!signedBuffer || signedBuffer.length < 100) {
    const stderr = result.stderr?.toString("utf8") ?? "";
    throw new Error(
      `aec_signer.py: stdout vacío o muy corto (${signedBuffer?.length ?? 0} bytes). stderr: ${stderr.slice(0, 500)}`,
    );
  }

  // Devolver como string latin1 (preserva los bytes ISO-8859-1)
  return signedBuffer.toString("latin1");
}

/**
 * Verifica que un AEC firmado tenga las 3 firmas estructuralmente bien
 * insertadas (sin validar criptográficamente). Útil para tests y
 * sanity-check antes de mandar al SII.
 *
 * Devuelve `null` si todo OK; string con el problema si falta algo.
 */
export function verifyAecHasThreeSignatures(signedXml: string): string | null {
  // Las 3 firmas externas (sobre DTECedido / Cesion / AEC) deben aparecer
  // como <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"> sin prefijo.
  // El DTE original embebido suele traer una <ds:Signature> con prefijo —
  // esa NO la contamos.
  const externalSigs = (
    signedXml.match(
      /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/g,
    ) ?? []
  ).length;
  if (externalSigs < 3) {
    return `Esperaba 3 firmas externas (DTECedido + Cesion + AEC), encontré ${externalSigs}.`;
  }
  if (!signedXml.includes("<DocumentoDTECedido")) {
    return "Falta <DocumentoDTECedido>.";
  }
  if (!signedXml.includes("<DocumentoCesion")) {
    return "Falta <DocumentoCesion>.";
  }
  if (!signedXml.includes("<DeclaracionJurada>")) {
    return "Falta <DeclaracionJurada> (Ley 19.983) — sin esto no hay mérito ejecutivo.";
  }
  return null;
}
