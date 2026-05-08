#!/usr/bin/env python3
"""
AEC XMLDSig Signer — implementación 100% manual (lxml + cryptography).

Lee el AEC sin firmar desde stdin (encoding ISO-8859-1), aplica las 3 firmas
XMLDSig requeridas por el RPETC del SII y escribe el AEC firmado a stdout.

Uso:
    python3 aec_signer.py --pfx <base64_pfx> --password <pfx_password>

Stdin:  XML sin firmar (encoding ISO-8859-1)
Stdout: XML firmado   (encoding ISO-8859-1)
Stderr: logs de debug

Las 3 firmas se aplican en orden:
  1. Sobre <DTECedido>  → Signature insertada al final de DTECedido
  2. Sobre <Cesion>     → Signature insertada al final de Cesion
  3. Sobre <AEC>        → Signature insertada al final de AEC

Cada firma usa:
  - CanonicalizationMethod: Inclusive C14N 1.0 sin comentarios
  - SignatureMethod: RSA-SHA1
  - DigestMethod: SHA1
  - Transform: enveloped-signature
  - Reference URI=""  (cubre el elemento padre en contexto standalone)
  - KeyInfo: KeyValue/RSAKeyValue + X509Data/X509Certificate

DISEÑO DE SIGNING EN SUBCONTEXT:
  El SII verifica cada Signature en el contexto del ELEMENTO PADRE.
  Usamos un documento standalone por elemento para que:
    C14N(standalone_DTECedido - DTECedido_Sig) = lo que el SII re-computa.

  El SignatureValue se computa sobre C14N(SignedInfo) con lxml, lo que
  garantiza que la verificación posterior con lxml también funcione.

  Nota: pyxmlsec (libxmlsec1) tiene un bug en el cálculo del C14N del
  SignedInfo para el SignatureValue; por eso se usa lxml + cryptography.
"""

import sys
import os
import copy
import argparse
import base64
import hashlib
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12 as crypto_pkcs12
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography import x509 as crypto_x509


DS_NS = 'http://www.w3.org/2000/09/xmldsig#'
XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'
SII_NS = 'http://www.sii.cl/SiiDte'
C14N_ALG = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
RSA_SHA1_ALG = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
SHA1_ALG = 'http://www.w3.org/2000/09/xmldsig#sha1'
ENVELOPED_SIG = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'


def load_pfx(pfx_b64: str, password: str):
    """
    Extrae clave privada y certificado del PFX base64.
    Usa cryptography para soportar formatos legacy RC2/3DES (certs SII chilenos).
    Devuelve (private_key, cert_pem_bytes, cert_der_bytes).
    """
    pfx_bytes = base64.b64decode(pfx_b64)
    password_bytes = password.encode('utf-8') if password else b''
    private_key, cert, _ = crypto_pkcs12.load_key_and_certificates(pfx_bytes, password_bytes)
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    return private_key, cert_pem, cert_der


def _int_to_b64(n: int) -> str:
    """Convierte entero big-endian a base64 (xs:base64Binary)."""
    length = (n.bit_length() + 7) // 8
    return base64.b64encode(n.to_bytes(length, 'big')).decode('ascii')


def _collect_used_ns_uris(element: etree._Element) -> set:
    """
    Recolecta recursivamente los URIs de namespace utilizados directamente
    en el elemento o sus descendientes (como namespace de elementos o atributos).

    Nota: NO incluye namespaces heredados de ancestors que no estén en uso
    dentro del subtree del elemento. Esto imita cómo el SII extrae cada elemento
    como un documento standalone antes de verificar su Signature.
    """
    used: set = set()
    stack = [element]
    while stack:
        el = stack.pop()
        qn = etree.QName(el.tag)
        if qn.namespace:
            used.add(qn.namespace)
        for attr_name in el.attrib:
            if attr_name.startswith('{'):
                ns = attr_name.split('}')[0][1:]
                if ns:
                    used.add(ns)
        stack.extend(el)
    return used


def make_standalone(element: etree._Element) -> etree._Element:
    """
    Crea una copia standalone del elemento incluyendo SÓLO los namespaces
    que son visiblemente utilizados dentro del subtree del elemento.

    El SII extrae cada elemento (DTECedido, Cesion) de su contexto AEC y lo
    verifica como documento independiente. Al hacerlo, NO hereda namespaces
    del AEC root que no sean usados dentro del elemento (ej. xmlns:xsi,
    que sólo aparece en el atributo xsi:schemaLocation del AEC root).

    Incluir namespaces no utilizados (como xmlns:xsi) haría que el C14N del
    SignedInfo difiera del C14N que el SII computa al verificar, invalidando
    el SignatureValue.
    """
    # Namespaces realmente usados en el subtree del elemento
    used_uris = _collect_used_ns_uris(element)

    # Del nsmap completo en-scope, retener sólo los usados
    full_nsmap: dict = {}
    el = element
    while el is not None:
        for prefix, uri in (el.nsmap or {}).items():
            if prefix not in full_nsmap:
                full_nsmap[prefix] = uri
        el = el.getparent()

    # Filtrar: sólo namespaces visiblemente utilizados en el subtree
    filtered_nsmap = {p: u for p, u in full_nsmap.items() if u in used_uris}

    # Garantizar que el namespace del elemento raíz esté siempre incluido
    root_ns = etree.QName(element.tag).namespace
    if root_ns and root_ns not in filtered_nsmap.values():
        filtered_nsmap[None] = root_ns

    new_root = etree.Element(element.tag, nsmap=filtered_nsmap)
    for attr_name, attr_val in element.attrib.items():
        new_root.set(attr_name, attr_val)
    new_root.text = element.text
    new_root.tail = None
    for child in element:
        new_root.append(copy.deepcopy(child))
    return new_root


def build_signature_node(
    private_key,
    cert_der: bytes,
    reference_uri: str,
    add_xsi_to_signedinfo: bool = False,
) -> etree._Element:
    """
    Construye un elemento <Signature> completo con template vacío
    (DigestValue y SignatureValue vacíos, se llenan después).

    `reference_uri` es la URI de la Reference. Para AEC normalmente es
    "#ID" apuntando al hijo interno con ese ID.

    `add_xsi_to_signedinfo`: si True, declara `xmlns:xsi="..."` en el
    `<SignedInfo>`. LibreDTE hace esto SOLO para la firma del AEC root
    (cuarto parámetro `true` de FirmaElectronica::signXML); ese detalle es
    crítico para que el SII verifique la "Firma de Sobre" correctamente.

    IMPORTANTE: el AEC root tiene xmlns="http://www.sii.cl/SiiDte" como
    default namespace. Si insertamos `<Signature>` (en namespace xmldsig)
    sin redeclarar el default, lxml usa un prefijo automático `ns0:` en
    todos los descendientes, lo que cambia el C14N del SignedInfo y rompe
    el SignatureValue. Usamos nsmap={None: DS_NS} en la Signature para
    redeclarar xmlns="xmldsig" como default en su subtree.
    """
    sig = etree.Element(f'{{{DS_NS}}}Signature', nsmap={None: DS_NS})

    # SignedInfo — opcionalmente con xmlns:xsi declarado para la firma del sobre
    if add_xsi_to_signedinfo:
        si = etree.SubElement(
            sig, f'{{{DS_NS}}}SignedInfo', nsmap={None: DS_NS, 'xsi': XSI_NS}
        )
    else:
        si = etree.SubElement(sig, f'{{{DS_NS}}}SignedInfo')
    c14n_m = etree.SubElement(si, f'{{{DS_NS}}}CanonicalizationMethod')
    c14n_m.set('Algorithm', C14N_ALG)
    sig_m = etree.SubElement(si, f'{{{DS_NS}}}SignatureMethod')
    sig_m.set('Algorithm', RSA_SHA1_ALG)
    ref = etree.SubElement(si, f'{{{DS_NS}}}Reference')
    ref.set('URI', reference_uri)
    transforms = etree.SubElement(ref, f'{{{DS_NS}}}Transforms')
    transform = etree.SubElement(transforms, f'{{{DS_NS}}}Transform')
    transform.set('Algorithm', ENVELOPED_SIG)
    dm = etree.SubElement(ref, f'{{{DS_NS}}}DigestMethod')
    dm.set('Algorithm', SHA1_ALG)
    dv = etree.SubElement(ref, f'{{{DS_NS}}}DigestValue')
    dv.text = ''  # se rellena después

    # SignatureValue (vacío — se rellena después)
    sv_el = etree.SubElement(sig, f'{{{DS_NS}}}SignatureValue')
    sv_el.text = ''

    # KeyInfo
    ki = etree.SubElement(sig, f'{{{DS_NS}}}KeyInfo')

    # KeyValue → RSAKeyValue
    kv = etree.SubElement(ki, f'{{{DS_NS}}}KeyValue')
    rsa_kv = etree.SubElement(kv, f'{{{DS_NS}}}RSAKeyValue')
    pub_nums = private_key.public_key().public_numbers()
    mod_el = etree.SubElement(rsa_kv, f'{{{DS_NS}}}Modulus')
    mod_el.text = _int_to_b64(pub_nums.n)
    exp_el = etree.SubElement(rsa_kv, f'{{{DS_NS}}}Exponent')
    exp_el.text = _int_to_b64(pub_nums.e)

    # X509Data → X509Certificate
    x509_data = etree.SubElement(ki, f'{{{DS_NS}}}X509Data')
    x509_cert_el = etree.SubElement(x509_data, f'{{{DS_NS}}}X509Certificate')
    x509_cert_el.text = base64.b64encode(cert_der).decode('ascii')

    return sig


def fix_dte_internal_signature(doc: etree._Element, private_key, cert_der: bytes) -> None:
    """
    Re-firma la firma interna del DTE para que sea válida en el contexto del AEC.

    El DTE original puede haber sido firmado como documento standalone (sin xmlns
    en scope o con diferente namespace context). Al embeberse en el AEC (que tiene
    xmlns="http://www.sii.cl/SiiDte" y xmlns:xsi="..."), la C14N del <Documento>
    cambia por la herencia de namespaces, invalidando el DigestValue original.

    Re-calculamos DigestValue y SignatureValue de la firma interna del DTE usando
    la clave privada del AEC (mismo certificado), de forma que el SII pueda
    verificarla correctamente dentro del contexto del AEC.

    Debe llamarse ANTES de agregar las firmas externas (DTECedido, Cesion, AEC).
    """
    # Buscar la firma interna del DTE (usa local-name() para aceptar ds: o sin prefijo)
    dte_sigs = doc.xpath('//*[local-name()="DTE"]/*[local-name()="Signature"]')
    if not dte_sigs:
        print("[aec_signer] ADVERTENCIA: No se encontró firma interna del DTE", file=sys.stderr)
        return

    dte_sig = dte_sigs[0]

    # Obtener la referencia y el URI del elemento firmado
    refs = dte_sig.xpath('.//*[local-name()="Reference"]')
    if not refs:
        print("[aec_signer] ADVERTENCIA: Firma interna del DTE sin Reference", file=sys.stderr)
        return

    ref = refs[0]
    uri = ref.get('URI', '')
    doc_id = uri.lstrip('#')

    if not doc_id:
        print("[aec_signer] ADVERTENCIA: Firma interna del DTE con URI vacío", file=sys.stderr)
        return

    # Encontrar el elemento <Documento> por ID en el DOM completo del AEC
    matches = doc.xpath(f'//*[@ID="{doc_id}"]')
    if not matches:
        print(f"[aec_signer] ADVERTENCIA: Elemento ID='{doc_id}' no encontrado", file=sys.stderr)
        return

    documento = matches[0]

    # C14N del <Documento> en su contexto ACTUAL dentro del AEC
    # (hereda xmlns="http://www.sii.cl/SiiDte" y xmlns:xsi="..." del AEC root)
    c14n_bytes = etree.tostring(documento, method='c14n', exclusive=False, with_comments=False)
    new_dv = base64.b64encode(hashlib.sha1(c14n_bytes).digest()).decode('ascii')

    dv_elems = ref.xpath('.//*[local-name()="DigestValue"]')
    original_dv = dv_elems[0].text if dv_elems else '(no encontrado)'
    print(f"[aec_signer] DTE interno DigestValue original:    {original_dv}", file=sys.stderr)
    print(f"[aec_signer] DTE interno DigestValue recomputado: {new_dv}", file=sys.stderr)

    if original_dv == new_dv:
        print("[aec_signer] DTE interno: DigestValue ya es correcto, no se re-firma", file=sys.stderr)
        return

    # Actualizar DigestValue
    dv_elems[0].text = new_dv

    # Recomputar SignatureValue = RSA-SHA1(C14N(SignedInfo con nuevo DigestValue))
    si_list = dte_sig.xpath('./*[local-name()="SignedInfo"]')
    if not si_list:
        print("[aec_signer] ADVERTENCIA: Firma interna del DTE sin SignedInfo", file=sys.stderr)
        return

    si = si_list[0]
    si_c14n = etree.tostring(si, method='c14n', exclusive=False, with_comments=False)
    new_sv = base64.b64encode(
        private_key.sign(si_c14n, padding.PKCS1v15(), hashes.SHA1())
    ).decode('ascii')

    sv_elems = dte_sig.xpath('./*[local-name()="SignatureValue"]')
    if sv_elems:
        sv_elems[0].text = new_sv

    # Auto-verificar
    cert_obj = crypto_x509.load_der_x509_certificate(cert_der)
    try:
        cert_obj.public_key().verify(
            base64.b64decode(new_sv), si_c14n, padding.PKCS1v15(), hashes.SHA1()
        )
        print("[aec_signer] DTE interno: ✅ re-firmado y verificado OK", file=sys.stderr)
    except Exception as e:
        print(f"[aec_signer] DTE interno: ❌ verificación falló: {e}", file=sys.stderr)


def _c14n_without_xsi(target: etree._Element) -> bytes:
    """
    Canonicaliza el target REMOVIENDO `xmlns:xsi` del scope heredado.

    Hallazgo de @dansanti (LibreDTE issue #18, Sep 2016):
      El SII calcula el digest del subtree CON `xmlns="http://www.sii.cl/SiiDte"`
      heredado pero SIN `xmlns:xsi="..."`. C14N inclusive estándar incluye TODOS
      los namespaces en scope, así que el digest difiere.

    Reconstruimos el target en un árbol limpio con nsmap explícito que SOLO
    contiene xmlns="http://www.sii.cl/SiiDte" (sin xmlns:xsi). Atributos del
    target en namespace xsi se descartan; los hijos se copian tal cual.

    Esto es lo que el SII parece hacer al verificar firmas internas: extrae
    el subtree y descarta xmlns:xsi del contexto antes de canonicalizar.
    """
    target_qn = etree.QName(target.tag)
    new_nsmap = {None: target_qn.namespace} if target_qn.namespace else {}
    new_target = etree.Element(target.tag, nsmap=new_nsmap)
    for k, v in target.attrib.items():
        if not k.startswith('{' + XSI_NS + '}'):
            new_target.set(k, v)
    new_target.text = target.text
    for child in target:
        new_target.append(copy.deepcopy(child))
    return etree.tostring(new_target, method='c14n', with_comments=False, exclusive=False)


def compute_referenced_element_digest(
    target: etree._Element,
    strip_inherited_xsi: bool,
) -> str:
    """
    Computa el DigestValue para una Reference URI="#ID" donde el ID apunta a
    un elemento HIJO del wrapper padre que contiene la Signature.

    DigestValue = SHA1(C14N(<elemento_referenciado>))

    El parámetro `strip_inherited_xsi` controla si se descarta `xmlns:xsi`
    HEREDADO del scope antes de canonicalizar:
      - `True`  para firmas INTERNAS (DTECedido, Cesion) — el SII descarta
                el xmlns:xsi heredado del AEC root al verificar (técnica
                @dansanti, LibreDTE issue #18 Sep/2016).
      - `False` para la firma del AEC ROOT — xmlns:xsi está declarado en
                el propio root, no heredado, por lo que se incluye en C14N.
    """
    if strip_inherited_xsi:
        c14n_bytes = _c14n_without_xsi(target)
    else:
        c14n_bytes = etree.tostring(
            target, method='c14n', with_comments=False, exclusive=False
        )
    sha1_hash = hashlib.sha1(c14n_bytes).digest()
    return base64.b64encode(sha1_hash).decode('ascii')


def _clean_subtree(elem: etree._Element) -> etree._Element:
    """
    Reconstruye el subtree con nsmap mínimo (sólo el namespace propio del
    elemento, sin namespaces heredados del padre como xmlns:xsi).

    Esto es lo que el SII espera al canonicalizar el SignedInfo: éste vive
    en namespace xmldsig pero no debe arrastrar xmlns:xsi heredado del AEC
    root al canonicalizarse para el cómputo del SignatureValue.
    """
    elem_qn = etree.QName(elem.tag)
    nsmap = {None: elem_qn.namespace} if elem_qn.namespace else {}
    new = etree.Element(elem.tag, nsmap=nsmap)
    for k, v in elem.attrib.items():
        new.set(k, v)
    new.text = elem.text
    for child in elem:
        new.append(_clean_subtree(child))
    return new


def compute_signature_value(sig_node: etree._Element, private_key) -> str:
    """
    Computa SignatureValue = base64(RSA-SHA1(C14N(SignedInfo))).

    El SignedInfo se canonicaliza en un árbol LIMPIO (sin namespaces heredados
    del scope del AEC). Esto matchea el fixture EOK donde `<SignedInfo>` no
    tiene xmlns:xsi declarado, y es lo que el SII calcula al verificar.
    """
    si_list = sig_node.xpath('./*[local-name()="SignedInfo"]')
    if not si_list:
        raise ValueError("No se encontró SignedInfo en la Signature")
    si = si_list[0]

    # SignedInfo limpio (sin xmlns:xsi heredado del AEC root)
    clean_si = _clean_subtree(si)
    c14n_bytes = etree.tostring(clean_si, method='c14n', with_comments=False, exclusive=False)

    # Firmar con RSA-SHA1 usando cryptography (produce SignatureValue correcto)
    sig_bytes = private_key.sign(c14n_bytes, padding.PKCS1v15(), hashes.SHA1())
    return base64.b64encode(sig_bytes).decode('ascii')


def sign_element(
    doc_root: etree._Element,
    parent_tag: str,
    inner_id: str,
    private_key,
    cert_der: bytes,
) -> None:
    """
    Firma el wrapper <parent_tag> apuntando al hijo con ID `inner_id`,
    siguiendo el patrón LibreDTE (que produce AECs que el SII acepta EOK):

      <parent_tag>
        <DocumentoX ID="{inner_id}">...</DocumentoX>
        <Signature>
          <Reference URI="#{inner_id}">
            <Transform Algorithm="enveloped-signature"/>
          </Reference>
          ...
        </Signature>
      </parent_tag>

    Proceso:
      1. Localizar target = elemento HIJO con `inner_id`.
      2. DigestValue = SHA1(C14N(<target> SIN xmlns:xsi heredado))
         (técnica @dansanti — el SII descarta xmlns:xsi del scope al verificar)
      3. Construir Signature template con URI="#inner_id" y ese DigestValue.
      4. Appendear Signature al wrapper padre (NO dentro del target).
      5. SignatureValue = RSA-SHA1(C14N(SignedInfo)).
      6. Self-verify.
    """
    if parent_tag == 'AEC':
        wrapper = doc_root
    else:
        wrappers = doc_root.xpath(f"//*[local-name()='{parent_tag}']")
        if not wrappers:
            raise ValueError(f"Wrapper <{parent_tag}> no encontrado en el documento")
        wrapper = wrappers[0]

    # XMLDSig ESTÁNDAR (URI="" + enveloped-signature) — el patrón que Acepta /
    # SimpleAPI usan en los AECs EOK aceptados por el SII:
    #
    #   1. Crear Signature template con DigestValue vacío
    #   2. Insertar Signature en el wrapper (DTECedido, Cesion, o AEC root)
    #   3. DigestValue = SHA1(C14N(doc_root SIN esta Signature))
    #      (la transformada enveloped-signature elimina la propia Sig)
    #   4. SignatureValue = RSA-SHA1(C14N(SignedInfo))
    #
    # IMPORTANTE: el orden de firmado es CRÍTICO. Cuando se firma DTECedido
    # primero, la Cesion sig y AEC sig todavía no existen, así que el digest
    # de DTECedido cubre el AEC sin Cesion_sig ni AEC_sig. Cuando se firma
    # Cesion después, la Cesion sig se agrega y su digest cubre el AEC con
    # DTECedido_sig pero sin AEC_sig. Y así sucesivamente.
    sig_node = build_signature_node(
        private_key, cert_der, '', add_xsi_to_signedinfo=False,
    )
    wrapper.append(sig_node)

    # DigestValue = SHA1(C14N(doc_root - esta_Signature)) — pero SIN xmlns:xsi
    # en el root del documento (técnica @dansanti aplicada al doc completo)
    sig_parent = sig_node.getparent()
    sig_idx = list(sig_parent).index(sig_node)
    sig_parent.remove(sig_node)
    try:
        # Reconstruir doc_root SIN xmlns:xsi (limpio) y C14N de eso
        c14n_bytes = _c14n_without_xsi(doc_root)
    finally:
        sig_parent.insert(sig_idx, sig_node)
    dv = base64.b64encode(hashlib.sha1(c14n_bytes).digest()).decode('ascii')
    sig_node.xpath('.//*[local-name()="DigestValue"]')[0].text = dv
    print(f"[aec_signer] <{parent_tag}> URI=\"\" DV={dv[:20]}... (sin xsi)", file=sys.stderr)

    # --- 4. SignatureValue ---
    sig_value = compute_signature_value(sig_node, private_key)
    sig_node.xpath('./*[local-name()="SignatureValue"]')[0].text = sig_value

    # --- 5. Self-verify (usar mismo C14N "clean" que compute_signature_value) ---
    si_list = sig_node.xpath('./*[local-name()="SignedInfo"]')
    clean_si = _clean_subtree(si_list[0])
    si_c14n = etree.tostring(clean_si, method='c14n', with_comments=False, exclusive=False)
    cert = crypto_x509.load_der_x509_certificate(cert_der)
    try:
        cert.public_key().verify(
            base64.b64decode(sig_value),
            si_c14n,
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
        print(f"[aec_signer] <{parent_tag}> ✅ Signature self-verify OK", file=sys.stderr)
    except Exception as e:
        print(f"[aec_signer] <{parent_tag}> ❌ Signature self-verify FAILED: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description='AEC XML signer (manual XMLDSig)')
    parser.add_argument('--pfx', required=True, help='PFX certificate as base64')
    parser.add_argument('--password', required=True, help='PFX password')
    parser.add_argument(
        '--no-refix-dte-sig',
        action='store_true',
        help='No re-firmar la firma interna del DTE (preserva la firma original).',
    )
    args = parser.parse_args()

    # Leer AEC sin firmar desde stdin
    unsigned_bytes = sys.stdin.buffer.read()
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_DTECEDIDO-->', b'')
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_CESION-->', b'')
    unsigned_bytes = unsigned_bytes.replace(b'<!--SIG_AEC-->', b'')

    parser_lxml = etree.XMLParser(remove_comments=True)
    try:
        doc = etree.fromstring(unsigned_bytes, parser_lxml)
    except Exception as e:
        print(f"ERROR: no se pudo parsear el XML: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        private_key, _cert_pem, cert_der = load_pfx(args.pfx, args.password)
    except Exception as e:
        print(f"ERROR: no se pudo cargar el PFX: {e}", file=sys.stderr)
        sys.exit(1)

    # Re-firmar la firma interna del DTE para que sea válida en el contexto del AEC.
    # El DTE original fue firmado con un namespace context diferente (standalone sin xmlns:xsi).
    # Al embeberse en el AEC, el DigestValue del <Documento> cambia por los namespaces heredados.
    # Con --no-refix-dte-sig se omite (útil para probar si el SII NO re-verifica la firma interna).
    if args.no_refix_dte_sig:
        print("[aec_signer] --no-refix-dte-sig: NO se re-firma la firma interna del DTE", file=sys.stderr)
    else:
        print("[aec_signer] Re-firmando firma interna del DTE para contexto AEC...", file=sys.stderr)
        fix_dte_internal_signature(doc, private_key, cert_der)

    # Detectar IDs internos: el aec-builder.ts genera DocumentoDTECedido,
    # DocumentoCesion y DocumentoAEC con sus respectivos atributos ID.
    def _find_id(local_name: str) -> str:
        elems = doc.xpath(f"//*[local-name()='{local_name}']")
        if not elems or 'ID' not in elems[0].attrib:
            raise ValueError(f"<{local_name}> no encontrado o sin ID")
        return elems[0].get('ID')

    id_dtecedido = _find_id('DocumentoDTECedido')
    id_cesion = _find_id('DocumentoCesion')
    id_aec = _find_id('DocumentoAEC')
    print(f"[aec_signer] IDs detectados: DTECedido={id_dtecedido}, Cesion={id_cesion}, AEC={id_aec}", file=sys.stderr)

    # Firmar DTECedido, Cesion y AEC en orden — patrón LibreDTE:
    #   URI="#OPAI_DTECEDIDO_xxx" → SHA1(C14N(<DocumentoDTECedido> sin xmlns:xsi))
    #   URI="#OPAI_CESION_xxx"     → SHA1(C14N(<DocumentoCesion> sin xmlns:xsi))
    #   URI="#OPAI_AEC_xxx"        → SHA1(C14N(<DocumentoAEC> sin xmlns:xsi))
    signing_plan = [
        ('DTECedido', id_dtecedido),
        ('Cesion', id_cesion),
        ('AEC', id_aec),
    ]
    for parent_tag, inner_id in signing_plan:
        try:
            print(f"[aec_signer] Firmando <{parent_tag}> (URI=#{inner_id})...", file=sys.stderr)
            sign_element(doc, parent_tag, inner_id, private_key, cert_der)
        except Exception as e:
            print(f"ERROR: fallo al firmar <{parent_tag}>: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.exit(1)

    # Serializar a ISO-8859-1
    signed_bytes = etree.tostring(
        doc,
        xml_declaration=True,
        encoding='ISO-8859-1',
        pretty_print=False,
    )
    # lxml usa comillas simples; el SII espera comillas dobles
    signed_bytes = signed_bytes.replace(
        b"<?xml version='1.0' encoding='ISO-8859-1'?>",
        b'<?xml version="1.0" encoding="ISO-8859-1"?>',
        1,
    )
    sys.stdout.buffer.write(signed_bytes)
    print(f"[aec_signer] OK — {len(signed_bytes)} bytes escritos a stdout", file=sys.stderr)


if __name__ == '__main__':
    main()
