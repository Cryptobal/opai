/**
 * SII RTC AEC builder.
 *
 * Genera el XML del Archivo Electrónico de Cesión (AEC) que se manda al
 * Registro Público Electrónico de Transferencia de Crédito (RPETC) del
 * SII. El XML resultante NO está firmado todavía — eso lo hace
 * `aec-signer.ts` aplicando 3 firmas XMLDSig (DocumentoDTECedido,
 * DocumentoCesion, DocumentoAEC).
 *
 * Estructura canónica (referencia: AEC real validado por SII en producción
 * — TrackId 11998878336 EOK, fixture `__tests__/fixtures/aec-real-eok.xml`):
 *
 *   <AEC xmlns="http://www.sii.cl/SiiDte"
 *        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 *        xsi:schemaLocation="http://www.sii.cl/SiiDte AEC_v10.xsd"
 *        version="1.0">
 *     <DocumentoAEC ID="OPAI_AEC_{folio}_{seq}">
 *       <Caratula version="1.0">
 *         RutCedente, RutCesionario, NmbContacto, [FonoContacto],
 *         MailContacto, TmstFirmaEnvio
 *       </Caratula>
 *       <Cesiones>
 *         <DTECedido version="1.0">
 *           <DocumentoDTECedido ID="OPAI_DTECEDIDO_{folio}_{seq}">
 *             <DTE>...DTE original íntegro con su firma...</DTE>
 *             <TmstFirma>{ts}</TmstFirma>
 *           </DocumentoDTECedido>
 *           <Signature/>  ← firma #1 (enveloped, URI="")
 *         </DTECedido>
 *         <Cesion version="1.0">
 *           <DocumentoCesion ID="OPAI_CESION_{folio}_{seq}">
 *             SeqCesion, IdDTE (TipoDTE/RUTEmisor/RUTReceptor/Folio/FchEmis/MntTotal —
 *             SIN razones sociales), Cedente (con DeclaracionJurada Ley 19.983
 *             dinámica + RUTAutorizado del cert), Cesionario, MontoCesion,
 *             UltimoVencimiento, [eMailDeudor], TmstCesion
 *           </DocumentoCesion>
 *           <Signature/>  ← firma #2 (enveloped, URI="")
 *         </Cesion>
 *       </Cesiones>
 *     </DocumentoAEC>
 *     <Signature/>  ← firma #3 (enveloped, URI="")
 *   </AEC>
 *
 * Doc oficial:
 *   https://www.sii.cl/factura_electronica/envio_automatico_aec.pdf
 *   https://www.sii.cl/factura_electronica/ws_consulta_estado_aec.pdf
 *
 * V1: solo cesión TOTAL (montoCesion = mntTotal del DTE), secuencia 1.
 */

/**
 * Construye el texto de la declaración jurada del cedente (Ley 19.983 art. 9).
 *
 * El texto es **dinámico** e incluye los nombres y RUTs de las 3 partes
 * (cedente, cesionario, deudor). Este formato es el que usan Acepta y
 * SCF/Wherex y fue aceptado EOK por el SII en producción
 * (TrackId 11998878336).
 *
 * Sin esta declaración (o un acuse de recibo electrónico equivalente), la
 * cesión NO da mérito ejecutivo y el factoring no podrá cobrar al deudor
 * en sede ejecutiva (art. 9 Ley 19.983).
 */
export function buildDeclaracionJuradaLey19983(args: {
  cedenteRazonSocial: string;
  cedenteRut: string;
  cesionarioRazonSocial: string;
  cesionarioRut: string;
  deudorRazonSocial: string;
  deudorRut: string;
}): string {
  return (
    `Se declara bajo juramento que ${args.cedenteRazonSocial}, ` +
    `RUT ${args.cedenteRut} ha puesto a disposicion del cesionario ` +
    `${args.cesionarioRazonSocial} , RUT ${args.cesionarioRut}, ` +
    `el o los documentos donde constan los recibos de las mercaderias ` +
    `entregadas o servicios prestados, entregados por parte del deudor ` +
    `de la factura ${args.deudorRazonSocial}, RUT ${args.deudorRut}, ` +
    `de acuerdo a lo establecido en la Ley Nro 19.983.`
  );
}

/** Datos del cedente (emisor del DTE original). */
export interface CedenteData {
  rut: string; // formato "12345678-9"
  razonSocial: string;
  direccion: string;
  email: string;
  /**
   * RUT autorizado a firmar (persona natural del cert digital).
   * V1 acepta solo 1; el SII permite hasta 3 RUTAutorizado.
   */
  rutAutorizado: string;
  /** Nombre completo del titular del cert (e.g. "JORGE ANDRES MONTENEGRO FUENZALIDA"). */
  nombreAutorizado: string;
}

/** Datos del cesionario (empresa de factoring). */
export interface CesionarioData {
  rut: string;
  razonSocial: string;
  direccion: string;
  email: string;
}

/**
 * Datos identificatorios del DTE que se cede. Las razones sociales se
 * usan en la DeclaracionJurada y el CARATULA pero NO van dentro del
 * bloque <IdDTE> (que solo lleva RUTs y montos). El AEC real validado
 * EOK tampoco las incluye en IdDTE.
 */
export interface IdDteData {
  tipoDte: number; // 33, 34, 43, 46
  folio: number;
  fechaEmision: string; // YYYY-MM-DD
  rutEmisor: string;
  rznSocEmisor: string; // solo para DeclaracionJurada (no va en IdDTE block)
  rutReceptor: string;
  rznSocReceptor: string; // solo para DeclaracionJurada (no va en IdDTE block)
  mntTotal: number;
}

/** Contacto en la carátula del AEC. */
export interface ContactoCaratula {
  nombre: string;
  fono?: string;
  mail: string;
}

/** Términos económicos de la cesión (V1: total). */
export interface TerminosCesion {
  /** Monto cedido en CLP (en V1 = mntTotal del DTE). */
  montoCesion: number;
  /** Último vencimiento del cobro al deudor (YYYY-MM-DD). */
  ultimoVencimiento: string;
  /** Email del deudor para notificación SII. Opcional. */
  emailDeudor?: string;
}

/** Input completo para construir el AEC. */
export interface BuildAecInput {
  /** XML del DTE original COMPLETO firmado y aceptado por el SII. */
  dteXml: Buffer;
  idDte: IdDteData;
  cedente: CedenteData;
  cesionario: CesionarioData;
  terminos: TerminosCesion;
  contacto: ContactoCaratula;
  /** Timestamp ISO local sin Z (`YYYY-MM-DDTHH:MM:SS`) para los TmstFirma*. */
  tmstFirma: string;
}

/** Output del builder: XML SIN firmar, listo para que aec-signer ponga las 3 firmas. */
export interface UnsignedAecXml {
  /** XML del AEC sin firmar (3 placeholders SIG_* en lugar de los <Signature>). */
  xml: string;
  /** ID asignado a DocumentoDTECedido (referencia para la firma #1). */
  idDocumentoDteCedido: string;
  /** ID asignado a DocumentoCesion (referencia para la firma #2). */
  idDocumentoCesion: string;
  /** ID asignado a DocumentoAEC (referencia para la firma #3). */
  idDocumentoAec: string;
  /** Texto canónico de la DeclaracionJurada (útil para auditoría / logging). */
  declaracionJurada: string;
}

/**
 * Helper: separar RUT chileno "12345678-9" en cuerpo + DV.
 * El SII pide ambos por separado en algunos contextos (RTCAnotEnvio).
 */
export function splitRut(rutFormatted: string): { cuerpo: string; dv: string } {
  const cleaned = rutFormatted.replace(/\./g, "").trim();
  const match = cleaned.match(/^(\d+)-([0-9kK])$/);
  if (!match) throw new Error(`RUT inválido: "${rutFormatted}"`);
  return { cuerpo: match[1], dv: match[2].toUpperCase() };
}

/**
 * Escapa caracteres XML estándar (5 reservados).
 * NO escapa los acentos / ñ — el SII acepta latin1 directo en esos casos.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extrae el contenido del nodo <DTE>...</DTE> del XML original y
 * NORMALIZA su tag de apertura para embeber dentro del AEC.
 *
 * IMPORTANTE: cuando el DTE es standalone, lleva
 * `<DTE version="1.0" xmlns="http://www.sii.cl/SiiDte">`. Pero al
 * embeberse dentro de `<DTECedido xmlns="http://www.sii.cl/SiiDte">`,
 * el xmlns en el `<DTE>` queda **redundante**. Si lo dejamos, xml-crypto
 * rompe la C14N inclusive (verificado con .scratch/depth-test.mjs:
 * "AEC + embedded DTE w/ xmlns" falla, sin xmlns pasa).
 *
 * El AEC real EOK (TrackId 11998878336) embebe el DTE SIN xmlns en su
 * tag <DTE> (el namespace lo hereda del root <AEC>). Esto matchea la
 * canonicalización inclusive correctamente.
 *
 * NO afecta la firma original del DTE: la firma interna referencia
 * `<Documento ID="...">` por URI="#ID", y la canonicalización de ese
 * subárbol no depende del atributo xmlns del nodo <DTE> padre.
 *
 * Usamos regex simple — el DTE ya viene firmado y con shape conocido,
 * no hay riesgo de sub-elementos <DTE> anidados.
 */
function extractDteRoot(dteXml: Buffer): string {
  const text = dteXml.toString("latin1");
  const match = text.match(/<DTE[\s\S]*?<\/DTE>/);
  if (!match) {
    throw new Error("DTE XML no contiene un nodo <DTE>...</DTE> válido.");
  }
  // Quitar xmlns="http://www.sii.cl/SiiDte" del tag de apertura <DTE ...>.
  // Lo hacemos solo en la apertura del DTE root, no en sub-elementos.
  // Acepta ambos formatos: xmlns="..." con comilla doble o simple.
  return match[0].replace(
    /(<DTE\b[^>]*?)\s+xmlns=("http:\/\/www\.sii\.cl\/SiiDte"|'http:\/\/www\.sii\.cl\/SiiDte')([^>]*>)/,
    "$1$3",
  );
}

/**
 * Construye el AEC SIN firmar. Las 3 firmas las agrega `aec-signer.ts`
 * después de canonicalizar cada elemento padre (enveloped-signature,
 * URI vacío).
 *
 * Decisiones de formato (matched contra AEC real EOK):
 *   - Root <AEC> con xmlns + xmlns:xsi + xsi:schemaLocation + version.
 *   - <DTECedido version="1.0"> y <Cesion version="1.0"> (wrappers).
 *   - IDs OPAI_<TIPO>_<FOLIO>_<SEQ> (cl-sii dice que el ID solo importa
 *     internamente, no lo valida el SII).
 *   - IdDTE NO lleva RznSocEmisor/RznSocReceptor (no van en este bloque,
 *     el AEC real solo tiene RUTs + montos en IdDTE).
 *   - DeclaracionJurada dinámica (formato Acepta/SCF/Wherex).
 *   - El DTE original se embebe íntegro, incluyendo su <Signature>.
 */
export function buildUnsignedAec(input: BuildAecInput): UnsignedAecXml {
  const { idDte, cedente, cesionario, terminos, contacto, tmstFirma } = input;

  const seq = 1; // V1: solo secuencia 1 (cesión total).
  const idDocumentoDteCedido = `OPAI_DTECEDIDO_${idDte.folio}_${seq}`;
  const idDocumentoCesion = `OPAI_CESION_${idDte.folio}_${seq}`;
  const idDocumentoAec = `OPAI_AEC_${idDte.folio}_${seq}`;

  const dteEmbedded = extractDteRoot(input.dteXml);

  const declaracionJurada = buildDeclaracionJuradaLey19983({
    cedenteRazonSocial: cedente.razonSocial,
    cedenteRut: cedente.rut,
    cesionarioRazonSocial: cesionario.razonSocial,
    cesionarioRut: cesionario.rut,
    deudorRazonSocial: idDte.rznSocReceptor,
    deudorRut: idDte.rutReceptor,
  });

  // ── DocumentoDTECedido (firma #1 luego sobre <DTECedido>) ──
  const documentoDteCedido =
    `<DocumentoDTECedido ID="${idDocumentoDteCedido}">` +
    dteEmbedded +
    `<TmstFirma>${tmstFirma}</TmstFirma>` +
    `</DocumentoDTECedido>`;

  // ── DocumentoCesion (firma #2 luego sobre <Cesion>) ──
  const idDteBlock =
    `<IdDTE>` +
    `<TipoDTE>${idDte.tipoDte}</TipoDTE>` +
    `<RUTEmisor>${idDte.rutEmisor}</RUTEmisor>` +
    `<RUTReceptor>${idDte.rutReceptor}</RUTReceptor>` +
    `<Folio>${idDte.folio}</Folio>` +
    `<FchEmis>${idDte.fechaEmision}</FchEmis>` +
    `<MntTotal>${Math.round(idDte.mntTotal)}</MntTotal>` +
    `</IdDTE>`;

  const cedenteBlock =
    `<Cedente>` +
    `<RUT>${cedente.rut}</RUT>` +
    `<RazonSocial>${escapeXml(cedente.razonSocial)}</RazonSocial>` +
    `<Direccion>${escapeXml(cedente.direccion)}</Direccion>` +
    `<eMail>${escapeXml(cedente.email)}</eMail>` +
    `<RUTAutorizado>` +
    `<RUT>${cedente.rutAutorizado}</RUT>` +
    `<Nombre>${escapeXml(cedente.nombreAutorizado)}</Nombre>` +
    `</RUTAutorizado>` +
    `<DeclaracionJurada>${escapeXml(declaracionJurada)}</DeclaracionJurada>` +
    `</Cedente>`;

  const cesionarioBlock =
    `<Cesionario>` +
    `<RUT>${cesionario.rut}</RUT>` +
    `<RazonSocial>${escapeXml(cesionario.razonSocial)}</RazonSocial>` +
    `<Direccion>${escapeXml(cesionario.direccion)}</Direccion>` +
    `<eMail>${escapeXml(cesionario.email)}</eMail>` +
    `</Cesionario>`;

  const documentoCesion =
    `<DocumentoCesion ID="${idDocumentoCesion}">` +
    `<SeqCesion>${seq}</SeqCesion>` +
    idDteBlock +
    cedenteBlock +
    cesionarioBlock +
    `<MontoCesion>${Math.round(terminos.montoCesion)}</MontoCesion>` +
    `<UltimoVencimiento>${terminos.ultimoVencimiento}</UltimoVencimiento>` +
    (terminos.emailDeudor ? `<eMailDeudor>${escapeXml(terminos.emailDeudor)}</eMailDeudor>` : "") +
    `<TmstCesion>${tmstFirma}</TmstCesion>` +
    `</DocumentoCesion>`;

  // ── Caratula ──
  const caratula =
    `<Caratula version="1.0">` +
    `<RutCedente>${cedente.rut}</RutCedente>` +
    `<RutCesionario>${cesionario.rut}</RutCesionario>` +
    `<NmbContacto>${escapeXml(contacto.nombre)}</NmbContacto>` +
    (contacto.fono ? `<FonoContacto>${escapeXml(contacto.fono)}</FonoContacto>` : "") +
    `<MailContacto>${escapeXml(contacto.mail)}</MailContacto>` +
    `<TmstFirmaEnvio>${tmstFirma}</TmstFirmaEnvio>` +
    `</Caratula>`;

  // ── DocumentoAEC (firma #3 luego sobre <AEC>) ──
  // IMPORTANTE: <DTECedido> y <Cesion> redeclarán xmlns="http://www.sii.cl/SiiDte"
  // explícitamente (redundante con la del root). Esto es necesario para que
  // xml-crypto canonicalice consistentemente con C14N inclusiva — sin esta
  // redeclaración, su signer y verifier producen formas canónicas distintas
  // cuando hay default-ns heredado del padre. Verificado con script
  // .scratch/xml-crypto-smoke.mjs (Test 6 pasa, Tests 2-5 fallan sin ella).
  // El SII acepta XML con declaraciones redundantes — son semánticamente
  // idénticas. La firma sigue siendo válida en la canonicalización del SII.
  const documentoAec =
    `<DocumentoAEC ID="${idDocumentoAec}">` +
    caratula +
    `<Cesiones>` +
    `<DTECedido version="1.0" xmlns="http://www.sii.cl/SiiDte">${documentoDteCedido}<!--SIG_DTECEDIDO--></DTECedido>` +
    `<Cesion version="1.0" xmlns="http://www.sii.cl/SiiDte">${documentoCesion}<!--SIG_CESION--></Cesion>` +
    `</Cesiones>` +
    `</DocumentoAEC>`;

  // ── Root <AEC> ──
  // El AEC real EOK trae xmlns:xsi + xsi:schemaLocation pero son
  // OPCIONALES para el SII (informativos, no validados). Los omitimos
  // porque rompen la C14N inclusive de xml-crypto (las declaraciones
  // de prefijos en el root no quedan visibles cuando un descendiente
  // redeclara el default namespace — bug de xml-crypto verificado en
  // .scratch/depth-test.mjs "AEC w/xsi+schemaLocation"). El SII no
  // exige schemaLocation, valida contra su XSD interno por el
  // namespace SiiDte que sí declaramos.
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>` +
    `<AEC xmlns="http://www.sii.cl/SiiDte" version="1.0">` +
    documentoAec +
    `<!--SIG_AEC-->` +
    `</AEC>`;

  return {
    xml,
    idDocumentoDteCedido,
    idDocumentoCesion,
    idDocumentoAec,
    declaracionJurada,
  };
}
