/**
 * SII SOAP — autenticación automática (CrSeed → firma → GetTokenFromSeed).
 *
 * Documentación oficial:
 *   - Autenticación Automática:
 *     https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf
 *
 * Flujo:
 *   1. POST {host}/DTEWS/CrSeed.jws            → obtiene <SEMILLA>
 *   2. signSeedXml(seed, cert)                 → genera <getToken> firmado
 *   3. POST {host}/DTEWS/GetTokenFromSeed.jws  → obtiene <TOKEN>
 *
 * Tipos compartidos (CertMaterial, SiiEnvironment, HOSTS) viven en
 * `sii-soap-helpers.ts` para evitar dependencias circulares.
 */

import { createSign } from "node:crypto";
import * as forge from "node-forge";
import {
  type CertMaterial,
  HOSTS,
  type SiiEnvironment,
  unescapeSiiInnerXml,
} from "./sii-soap-helpers";

/**
 * Extrae llave privada y certificado X.509 desde un buffer .pfx.
 * Compatible con certs digitales chilenos (RFC 3280).
 */
export function extractCertFromPfx(
  pfxBuffer: Buffer,
  password: string,
): CertMaterial {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  let privateKey: forge.pki.PrivateKey | null = null;
  let certificate: forge.pki.Certificate | null = null;

  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (
        safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag ||
        safeBag.type === forge.pki.oids.keyBag
      ) {
        privateKey = safeBag.key ?? null;
      } else if (safeBag.type === forge.pki.oids.certBag) {
        certificate = safeBag.cert ?? null;
      }
    }
  }
  if (!privateKey || !certificate) {
    throw new Error("PFX no contiene cert o privateKey válidos");
  }
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certificatePem = forge.pki.certificateToPem(certificate);
  const certBase64 = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s/g, "");
  const publicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  return { privateKeyPem, certificatePem, certBase64, publicKey };
}

/**
 * Paso 1: pedir semilla al SII.
 */
export async function getSiiSeed(env: SiiEnvironment): Promise<string> {
  const host = HOSTS[env];
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body><def:getSeed/></soapenv:Body>
</soapenv:Envelope>`;

  const r = await fetch(`${host}/DTEWS/CrSeed.jws`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: soapBody,
  });
  if (!r.ok) {
    throw new Error(`CrSeed HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  }
  // El XML interno con la semilla viene doble-escapado dentro de
  // <getSeedReturn>. Des-escapar antes de matchear.
  const inner = unescapeSiiInnerXml(await r.text());
  const match = inner.match(/<SEMILLA>(\d+)<\/SEMILLA>/);
  if (!match) throw new Error(`CrSeed sin <SEMILLA>: ${inner.slice(0, 500)}`);
  return match[1];
}

/**
 * Convierte un BigInteger de forge a base64 (sin padding extra), formato
 * que xmldsig espera para Modulus/Exponent dentro de RSAKeyValue.
 */
function bigIntToBase64(big: forge.jsbn.BigInteger): string {
  let hex = big.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  return forge.util.encode64(forge.util.hexToBytes(hex));
}

/**
 * Paso 2: firmar XML <getToken><item><Semilla>X</Semilla></item></getToken>
 * con XMLDSig (enveloped signature) usando el cert digital.
 *
 * IMPORTANTE — canonicalización C14N (RFC 3076):
 *   - Self-closing tags (`<foo/>`) deben expandirse a `<foo></foo>` en el
 *     SignedInfo que se firma. Si firmamos el string con self-closing,
 *     el SII canonicaliza primero (expande) y los bytes no coinciden →
 *     firma inválida → SII responde con un mensaje genérico tipo
 *     "elemento Certificate no existe".
 *   - Por eso emitimos `<SignedInfo>` ya en forma canónica (sin
 *     self-closing) y firmamos ese exact string. El mismo string se
 *     inserta tal cual en el output.
 *   - El XML del documento (sin Signature) tampoco tiene self-closing,
 *     así que el digest sí coincide.
 *
 * Defensa en profundidad: incluimos `<KeyValue><RSAKeyValue>` además del
 * X509Certificate (mismo patrón que LibreDTE/Acepta). Si el SII tiene
 * problemas leyendo el cert por algún motivo, puede validar la firma
 * directo con el RSA modulus/exponent.
 */
export function signSeedXml(seed: string, cert: CertMaterial): string {
  const xmlToSign = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;

  const digestSha1 = forge.md.sha1.create();
  digestSha1.update(xmlToSign, "utf8");
  const digestB64 = forge.util.encode64(digestSha1.digest().bytes());

  // Forma canónica C14N: tags pares en lugar de self-closing,
  // namespace propagado al SignedInfo (necesario al canonicalizarlo
  // como subset).
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestB64}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const sign = createSign("RSA-SHA1");
  sign.update(signedInfo);
  sign.end();
  const signatureValue = sign.sign(cert.privateKeyPem, "base64");

  // KeyValue defensivo con modulus/exponent del cert.
  const modulusB64 = bigIntToBase64(cert.publicKey.n);
  const exponentB64 = bigIntToBase64(cert.publicKey.e);
  const keyInfo =
    `<KeyInfo>` +
    `<KeyValue>` +
    `<RSAKeyValue>` +
    `<Modulus>${modulusB64}</Modulus>` +
    `<Exponent>${exponentB64}</Exponent>` +
    `</RSAKeyValue>` +
    `</KeyValue>` +
    `<X509Data>` +
    `<X509Certificate>${cert.certBase64}</X509Certificate>` +
    `</X509Data>` +
    `</KeyInfo>`;

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    keyInfo +
    `</Signature>`;

  return `<getToken><item><Semilla>${seed}</Semilla></item>${signature}</getToken>`;
}

/**
 * Paso 3: enviar XML firmado y obtener token.
 * El SII espera el XML firmado escapado dentro de <pszXml>.
 */
export async function getSiiToken(
  env: SiiEnvironment,
  signedXml: string,
): Promise<string> {
  const host = HOSTS[env];
  const escapedXml = signedXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body>
    <def:getToken>
      <pszXml>${escapedXml}</pszXml>
    </def:getToken>
  </soapenv:Body>
</soapenv:Envelope>`;

  const r = await fetch(`${host}/DTEWS/GetTokenFromSeed.jws`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: soapBody,
  });
  if (!r.ok) {
    throw new Error(
      `GetTokenFromSeed HTTP ${r.status}: ${(await r.text()).slice(0, 800)}`,
    );
  }
  // Mismo patrón que getSeed: la respuesta SOAP envuelve el XML del
  // SII doble-escapado dentro de <getTokenReturn>.
  const inner = unescapeSiiInnerXml(await r.text());
  const match = inner.match(/<TOKEN>([\w-]+)<\/TOKEN>/);
  if (!match) throw new Error(`GetTokenFromSeed sin TOKEN: ${inner.slice(0, 800)}`);
  return match[1];
}
