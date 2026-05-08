#!/usr/bin/env python3
"""
AEC XMLDSig Signer usando libxmlsec1.

Lee el AEC sin firmar desde stdin (encoding ISO-8859-1), aplica las 3 firmas
XMLDSig requeridas por el RPETC del SII y escribe el AEC firmado a stdout.

Uso:
    python3 aec_signer.py --pfx <base64_pfx> --password <pfx_password>

Stdin: XML sin firmar (encoding ISO-8859-1, con placeholders SIG_* eliminados)
Stdout: XML firmado (encoding ISO-8859-1)
Stderr: logs de debug

Las 3 firmas se aplican en orden:
  1. Sobre <DTECedido>  → Signature insertada al final de DTECedido
  2. Sobre <Cesion>     → Signature insertada al final de Cesion
  3. Sobre <AEC>        → Signature insertada al final de AEC

Cada firma usa:
  - CanonicalizationMethod: Inclusive C14N 1.0 (sin comentarios)
  - SignatureMethod: RSA-SHA1
  - DigestAlgorithm: SHA1
  - Transform: enveloped-signature
  - KeyInfo: X509Data/X509Certificate + KeyValue/RSAKeyValue
"""

import sys
import os
import argparse
import base64
import tempfile
from lxml import etree
import xmlsec
from cryptography.hazmat.primitives.serialization import pkcs12 as crypto_pkcs12
from cryptography.hazmat.primitives import serialization


DS_NS = 'http://www.w3.org/2000/09/xmldsig#'


def load_pfx(pfx_b64: str, password: str):
    """
    Extrae clave privada y certificado del PFX base64.

    Usa `cryptography` para leer el PKCS12 (soporta algoritmos legacy RC2/3DES
    usados en los certificados SII chilenos) y exporta como PEM para xmlsec.

    Devuelve (xkey para xmlsec, private_key de cryptography).
    """
    pfx_bytes = base64.b64decode(pfx_b64)
    password_bytes = password.encode('utf-8') if password else b''

    private_key, cert, _additional = crypto_pkcs12.load_key_and_certificates(
        pfx_bytes, password_bytes
    )

    key_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    )
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)

    # Escribir PEM temporales para xmlsec
    with tempfile.NamedTemporaryFile(suffix='.pem', delete=False) as f:
        f.write(key_pem)
        key_file = f.name
    with tempfile.NamedTemporaryFile(suffix='.pem', delete=False) as f:
        f.write(cert_pem)
        cert_file = f.name

    try:
        xkey = xmlsec.Key.from_file(key_file, xmlsec.constants.KeyDataFormatPem)
        xkey.load_cert_from_file(cert_file, xmlsec.constants.KeyDataFormatPem)
    finally:
        os.unlink(key_file)
        os.unlink(cert_file)

    return xkey, private_key


def _int_to_b64(n: int) -> str:
    """Convierte entero big-endian a base64 (formato xs:base64Binary)."""
    length = (n.bit_length() + 7) // 8
    return base64.b64encode(n.to_bytes(length, 'big')).decode('ascii')


def inject_rsa_key_value(sig_node: etree._Element, private_key) -> None:
    """
    Inyecta <RSAKeyValue><Modulus/><Exponent/></RSAKeyValue> dentro del
    <KeyValue> del <KeyInfo> de la firma.

    xmlsec.template.add_key_value() crea el nodo <KeyValue> vacío pero no lo
    rellena automáticamente al firmar; por eso lo llenamos manualmente con
    los componentes RSA extraídos desde la clave 'cryptography'.

    IMPORTANTE: debe llamarse ANTES de firmar el siguiente elemento, ya que
    el DigestValue del siguiente elemento incluye el KeyInfo de este.
    """
    pub_nums = private_key.public_key().public_numbers()
    modulus_b64 = _int_to_b64(pub_nums.n)
    exponent_b64 = _int_to_b64(pub_nums.e)

    ki_list = sig_node.xpath('./*[local-name()="KeyInfo"]')
    if not ki_list:
        return
    ki = ki_list[0]

    kv_list = ki.xpath('./*[local-name()="KeyValue"]')
    if not kv_list:
        return
    kv = kv_list[0]

    # Rellenar RSAKeyValue dentro de KeyValue
    rsa_kv = etree.SubElement(kv, f'{{{DS_NS}}}RSAKeyValue')
    mod_el = etree.SubElement(rsa_kv, f'{{{DS_NS}}}Modulus')
    mod_el.text = modulus_b64
    exp_el = etree.SubElement(rsa_kv, f'{{{DS_NS}}}Exponent')
    exp_el.text = exponent_b64


def sign_element(doc: etree._Element, xpath: str, xkey: xmlsec.Key, private_key) -> None:
    """
    Firma el elemento identificado por xpath y agrega la Signature al final del elemento.

    Usa Reference URI="" con enveloped-signature transform (igual que EOK).
    La Signature se genera sin prefijo (xmlns="xmldsig") para coincidir con el EOK.
    Después de firmar inyecta manualmente RSAKeyValue en el KeyInfo (xmlsec no
    lo llena automáticamente para claves cargadas desde PEM).
    """
    # Encontrar el elemento a firmar
    targets = doc.xpath(xpath)
    if not targets:
        raise ValueError(f"Elemento no encontrado: {xpath}")
    target = targets[0]

    # Crear template de Signature (sin prefijo ns → <Signature xmlns="xmldsig">)
    sig_node = xmlsec.template.create(
        doc,
        c14n_method=xmlsec.constants.TransformInclC14N,
        sign_method=xmlsec.constants.TransformRsaSha1,
        ns=None,
    )

    # Reference URI="" + transform enveloped-signature
    ref = xmlsec.template.add_reference(
        sig_node,
        xmlsec.constants.TransformSha1,
        uri="",
    )
    xmlsec.template.add_transform(ref, xmlsec.constants.TransformEnveloped)

    # KeyInfo: KeyValue (vacío — se rellena abajo) + X509Data
    # El XSD del SII (xmldsignature_v10.xsd) requiere KeyValue ANTES de X509Data.
    ki = xmlsec.template.ensure_key_info(sig_node)
    xmlsec.template.add_key_value(ki)
    xmlsec.template.add_x509_data(ki)

    # Insertar Signature al final del elemento objetivo
    target.append(sig_node)

    # Firmar (llena X509Data con el certificado; KeyValue queda vacío)
    ctx = xmlsec.SignatureContext()
    ctx.key = xkey
    ctx.sign(sig_node)

    # Inyectar RSAKeyValue DESPUÉS de firmar (no afecta la firma actual porque
    # enveloped-signature excluye <Signature> del DigestValue) y ANTES de firmar
    # el siguiente elemento (para que su DigestValue incluya el KeyValue correcto).
    inject_rsa_key_value(sig_node, private_key)


def main():
    parser = argparse.ArgumentParser(description='AEC XML signer using libxmlsec1')
    parser.add_argument('--pfx', required=True, help='PFX certificate as base64')
    parser.add_argument('--password', required=True, help='PFX password')
    args = parser.parse_args()

    # Leer AEC sin firmar desde stdin
    unsigned_bytes = sys.stdin.buffer.read()

    # Eliminar placeholders (si quedaran)
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_DTECEDIDO-->', b'')
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_CESION-->', b'')
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_AEC-->', b'')

    # Parsear con lxml (acepta ISO-8859-1 via la declaración XML)
    parser_lxml = etree.XMLParser(remove_comments=True)
    try:
        doc = etree.fromstring(unsigned_bytes, parser_lxml)
    except Exception as e:
        print(f"ERROR: no se pudo parsear el XML: {e}", file=sys.stderr)
        sys.exit(1)

    # Cargar clave PFX
    try:
        xkey, private_key = load_pfx(args.pfx, args.password)
    except Exception as e:
        print(f"ERROR: no se pudo cargar el PFX: {e}", file=sys.stderr)
        sys.exit(1)

    # Aplicar las 3 firmas en orden
    xpaths = [
        "//*[local-name()='DTECedido']",
        "//*[local-name()='Cesion']",
        "//*[local-name()='AEC']",
    ]
    for i, xpath in enumerate(xpaths, 1):
        try:
            print(f"[aec_signer] Firmando {xpath}...", file=sys.stderr)
            sign_element(doc, xpath, xkey, private_key)
        except Exception as e:
            print(f"ERROR: fallo al firmar {xpath}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

    # Serializar de vuelta a ISO-8859-1
    signed_bytes = etree.tostring(
        doc,
        xml_declaration=True,
        encoding='ISO-8859-1',
        pretty_print=False,
    )
    # lxml genera la declaración XML con comillas simples; el SII espera comillas dobles.
    signed_bytes = signed_bytes.replace(
        b"<?xml version='1.0' encoding='ISO-8859-1'?>",
        b'<?xml version="1.0" encoding="ISO-8859-1"?>',
        1,
    )
    sys.stdout.buffer.write(signed_bytes)
    print(f"[aec_signer] OK — {len(signed_bytes)} bytes", file=sys.stderr)


if __name__ == '__main__':
    main()
