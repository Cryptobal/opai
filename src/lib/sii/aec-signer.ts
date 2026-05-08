/**
 * SII RTC AEC signer.
 *
 * Aplica las 3 firmas XMLDSig que el AEC requiere al XML producido por
 * `aec-builder.ts`. Cada firma usa:
 *   - SignatureMethod: RSA-SHA1 (http://www.w3.org/2000/09/xmldsig#rsa-sha1)
 *   - DigestMethod:    SHA1
 *   - Canonicalization: c14n-20010315 (inclusive C14N — matchea AEC real EOK)
 *   - Reference URI="" + transform enveloped-signature
 *   - KeyInfo con KeyValue/RSAKeyValue + X509Data/X509Certificate (defensa
 *     en profundidad — mismo patrón que LibreDTE/Acepta)
 *
 * Las 3 firmas se aplican en orden (cada firma incluye en su digest a las
 * firmas previas):
 *   1. Sobre <DTECedido>      → Signature insertada al final de DTECedido
 *   2. Sobre <Cesion>         → Signature insertada al final de Cesion
 *   3. Sobre <AEC> (raíz)     → Signature insertada al final de AEC
 *
 * Importante: usamos xml-crypto (lib madura) en vez de canonicalización a
 * mano. Ya tuvimos un bug crítico de C14N en el seed (commit ff08ad53b);
 * la lección aprendida fue: para subárboles con namespaces, dejar que la
 * lib lo haga. Si funciona contra cert env del SII, también contra prod.
 */

import { SignedXml } from "xml-crypto";
import { extractCertFromPfx } from "./soap-client";
import * as forge from "node-forge";

/** Algoritmos RSA-SHA1 + SHA1 + C14N — todos los DTE/AEC chilenos los usan. */
const SIGNATURE_ALGORITHM =
  "http://www.w3.org/2000/09/xmldsig#rsa-sha1" as const;
const DIGEST_ALGORITHM =
  "http://www.w3.org/2000/09/xmldsig#sha1" as const;
const CANONICALIZATION_ALGORITHM =
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315" as const;
const ENVELOPED_TRANSFORM =
  "http://www.w3.org/2000/09/xmldsig#enveloped-signature" as const;

/**
 * Convierte un BigInt forge a base64 (matchea el formato de `<Modulus>`
 * y `<Exponent>` en RSAKeyValue del XMLDSig).
 */
function bigIntToBase64(big: forge.jsbn.BigInteger): string {
  let hex = big.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  return forge.util.encode64(forge.util.hexToBytes(hex));
}

/**
 * Construye el contenido interno de `<KeyInfo>` con KeyValue + X509Data
 * (defensa en profundidad). El SII acepta ambos formatos pero los AECs
 * reales (Acepta, Wherex, LibreDTE) usan los dos juntos.
 *
 * Esta función se inyecta como callback en xml-crypto.
 */
function buildKeyInfoContent(
  certBase64: string,
  publicKey: forge.pki.rsa.PublicKey,
): () => string {
  const modulusB64 = bigIntToBase64(publicKey.n);
  const exponentB64 = bigIntToBase64(publicKey.e);
  // Devolvemos una función — xml-crypto la invoca cuando construye
  // el bloque <KeyInfo>. El wrapper <KeyInfo>...</KeyInfo> lo agrega
  // xml-crypto solo, nosotros entregamos el contenido interno.
  return () =>
    `<KeyValue>` +
    `<RSAKeyValue>` +
    `<Modulus>${modulusB64}</Modulus>` +
    `<Exponent>${exponentB64}</Exponent>` +
    `</RSAKeyValue>` +
    `</KeyValue>` +
    `<X509Data>` +
    `<X509Certificate>${certBase64}</X509Certificate>` +
    `</X509Data>`;
}

/**
 * Firma UN elemento del AEC: configura xml-crypto con cert + algoritmos
 * SII, agrega Reference con URI="" + enveloped-signature, y appendea el
 * <Signature> dentro del elemento target.
 *
 * Devuelve el XML completo con la nueva firma insertada.
 */
function signOneElement(
  xml: string,
  targetXpath: string,
  cert: { privateKeyPem: string; certificatePem: string; certBase64: string; publicKey: forge.pki.rsa.PublicKey },
): string {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    getKeyInfoContent: buildKeyInfoContent(cert.certBase64, cert.publicKey),
  });

  // isEmptyUri:true es requerido: uri:"" es falsy en JS y xml-crypto
  // lo ignoraría, cayendo en el path de auto-asignación de Id="_0"
  // (lo que genera IDs duplicados cuando hay >1 firma). Con isEmptyUri,
  // xml-crypto emite <Reference URI=""> sin tocar los atributos del nodo.
  sig.addReference({
    xpath: targetXpath,
    digestAlgorithm: DIGEST_ALGORITHM,
    transforms: [ENVELOPED_TRANSFORM],
    uri: "",
    isEmptyUri: true,
  });

  sig.computeSignature(xml, {
    // sin prefijo: queremos <Signature xmlns="..."> sin "ds:" en el root
    // (matchea AEC real EOK). xml-crypto usa esto como default.
    prefix: "",
    location: { reference: targetXpath, action: "append" },
  });

  return sig.getSignedXml();
}

/** Input del signer — XML producido por buildUnsignedAec + cert PFX. */
export interface SignAecInput {
  /** XML sin firmar producido por `buildUnsignedAec` (con placeholders SIG_*). */
  unsignedXml: string;
  /** Buffer del certificado .pfx descifrado del tenant. */
  pfxBuffer: Buffer;
  /** Password del .pfx descifrado. */
  pfxPassword: string;
}

/**
 * Aplica las 3 firmas XMLDSig al AEC y devuelve el XML final firmado,
 * listo para enviar al SII vía RTCAnotEnvio.cgi.
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
  const cert = extractCertFromPfx(input.pfxBuffer, input.pfxPassword);

  // Quitar los 3 placeholders de comentario antes de firmar — si quedaran
  // en el XML, los digests incluirían ese texto y el SII rechazaría
  // (los placeholders son solo guía visual del builder).
  let xml = input.unsignedXml
    .replace("<!--SIG_DTECEDIDO-->", "")
    .replace("<!--SIG_CESION-->", "")
    .replace("<!--SIG_AEC-->", "");

  // Paso 1 — firma sobre <DTECedido>.
  xml = signOneElement(xml, "//*[local-name(.)='DTECedido']", cert);

  // Paso 2 — firma sobre <Cesion>. El digest acá ya incluye la firma
  // del paso 1 porque URI="" + enveloped-signature canonicaliza el
  // documento completo menos la nueva Signature.
  xml = signOneElement(xml, "//*[local-name(.)='Cesion']", cert);

  // Paso 3 — firma raíz sobre <AEC>. Cierra el AEC: el digest cubre
  // todo el documento (incluyendo las 2 firmas internas) menos la
  // nueva Signature de cierre.
  xml = signOneElement(xml, "//*[local-name(.)='AEC']", cert);

  return xml;
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
