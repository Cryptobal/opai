/**
 * PFX (PKCS#12) parser for Chilean digital certificates.
 *
 * Extracts metadata from a .pfx file:
 * - Subject CN (nombre del titular)
 * - RUT (de extension serialNumber)
 * - Issuer (autoridad certificadora)
 * - notBefore / notAfter (vigencia)
 * - SHA-1 fingerprint
 *
 * USAGE:
 *   const meta = parsePfx(pfxBuffer, password);
 */

import forge from "node-forge";

export interface PfxMetadata {
  rutTitular: string;       // "12345678-9"
  nombreTitular: string;    // CN del subject
  emisorCert: string;       // CN del issuer
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;      // SHA-1 hex (uppercase, sin separadores)
}

export class PfxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PfxParseError";
  }
}

export function parsePfx(pfxBuffer: Buffer, password: string): PfxMetadata {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(pfxBuffer.toString("binary"));
    const asn1 = forge.asn1.fromDer(der);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    throw new PfxParseError(
      "No se pudo parsear el PFX. Verifica que el password sea correcto."
    );
  }

  // Buscar el certificado del titular (el primer cert con privateKey en general)
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBags = bags[forge.pki.oids.certBag];
  if (!certBags || certBags.length === 0) {
    throw new PfxParseError("El PFX no contiene certificados.");
  }

  // Tomar el primero (que normalmente es el del titular, no la cadena CA)
  const cert = certBags[0].cert;
  if (!cert) {
    throw new PfxParseError("No se pudo extraer el certificado del PFX.");
  }

  const subjectCN = getCN(cert.subject.attributes);
  const issuerCN = getCN(cert.issuer.attributes);
  const rutTitular = extractRut(cert);

  // Calcular SHA-1 fingerprint
  const md = forge.md.sha1.create();
  md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
  const fingerprint = md.digest().toHex().toUpperCase();

  return {
    rutTitular,
    nombreTitular: subjectCN ?? "Desconocido",
    emisorCert: issuerCN ?? "Desconocido",
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    fingerprint,
  };
}

function getCN(attrs: forge.pki.CertificateField[]): string | null {
  const cn = attrs.find((a) => a.shortName === "CN" || a.name === "commonName");
  return cn?.value as string | null;
}

/**
 * RUT chileno está en serialNumber del subject (formato "12345678-9")
 * o a veces en el commonName con prefijo.
 */
function extractRut(cert: forge.pki.Certificate): string {
  // Intentar serialNumber primero
  const sn = cert.subject.attributes.find(
    (a) => a.shortName === "serialNumber" || a.name === "serialNumber"
  );
  if (sn?.value) {
    const match = String(sn.value).match(/(\d{1,8}-[\dKk])/);
    if (match) return match[1].toUpperCase();
  }

  // Fallback: buscar en CN
  const cn = getCN(cert.subject.attributes);
  if (cn) {
    const match = cn.match(/(\d{1,8}-[\dKk])/);
    if (match) return match[1].toUpperCase();
  }

  throw new PfxParseError(
    "No se pudo extraer el RUT del certificado. Verifica que sea un certificado chileno SII válido."
  );
}
