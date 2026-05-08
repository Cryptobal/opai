/**
 * DTE Provider Adapter Interface
 * All DTE providers (FACTO, SimpleFactura, etc.) must implement this interface
 */

export type DteIssueRequest = {
  dteType: number; // 33, 34, 39, 52, 56, 61
  /**
   * Folio del DTE. Opcional: para SimpleAPI lo asigna el folio-tracker
   * via reserveNextFolio() antes de llamar al provider; para STUB el
   * dte-issuer.service lo calcula localmente.
   */
  folio?: number;
  date: string; // YYYY-MM-DD
  issuerRut: string;
  issuerName: string;
  receiverRut: string;
  receiverName: string;
  receiverEmail?: string;
  /**
   * Datos del receptor que el SII exige en facturas (tipo 33). Si no
   * vienen, el provider usa defaults razonables ("Sin Giro", "Sin
   * direccion", "Santiago"). Se autocompletan desde CRM cuando el
   * receptor está vinculado a un account.
   */
  receiverGiro?: string;
  receiverDireccion?: string;
  receiverComuna?: string;
  receiverCiudad?: string;
  items: DteLineItem[];
  netAmount: number;
  exemptAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  /**
   * Referencia obligatoria SII para DTEs tipo 56 (Nota de Débito) y 61
   * (Nota de Crédito). Se serializa como bloque <Referencia> en el XML
   * que se envía al SII. Validar obligatoriedad en el issuer.
   */
  reference?: {
    /** Tipo del DTE original referenciado (33, 34, 39, 56, etc.). */
    dteType: number;
    /** Folio del DTE original. */
    folio: number;
    /** Fecha de emisión del DTE original (YYYY-MM-DD). */
    date: string;
    /** Código SII CodRef: 1=anula, 2=corrige texto, 3=corrige montos. */
    code: 1 | 2 | 3;
    /** Razón en texto libre (RazonRef). */
    reason: string;
  };
  /**
   * Referencias adicionales (no-DTE): Orden de Compra, HES, Contrato,
   * Resolución, etc. Se concatenan al bloque <Referencia> después de
   * la referencia principal. Hasta 40 refs totales por DTE según SII.
   *
   * Códigos típicos TpoDocRef:
   *   "801" — Orden de Compra
   *   "802" — Nota de Pedido
   *   "803" — Contrato
   *   "804" — Resolución
   *   "HES" — Hoja Entrada de Servicios (alfanumérico)
   */
  additionalReferences?: Array<{
    /** TpoDocRef: numérico (801, 803...) o alfanumérico ("HES", "GD"). */
    tipoDocRef: string;
    /** FolioRef: alfanumérico para refs no-tributarias. */
    folioRef: string;
    /** FchRef: fecha del documento referenciado YYYY-MM-DD. */
    fchRef: string;
    /** RazonRef: descripción libre. */
    razonRef: string;
  }>;
  /**
   * CAF XML (raw bytes) para providers que firman el DTE localmente
   * (ej. SimpleAPI). Pasado por dte-issuer.service tras reservar folio.
   */
  cafXml?: Buffer;
};

export type DteLineItem = {
  lineNumber: number;
  itemCode?: string;
  itemName: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountPct?: number;
  netAmount: number;
  isExempt: boolean;
};

export type DteIssueResponse = {
  success: boolean;
  trackId?: string;
  folio?: number;
  pdfUrl?: string;
  xmlUrl?: string;
  /**
   * XML completo del DTE firmado y timbrado (devuelto por el provider en
   * el paso `dte/generar`). El issuer service lo persiste en
   * `FinanceDte.dteXml` para poder regenerar PDFs sin re-emitir contra
   * el SII (los endpoints SII no exponen re-descarga de XMLs).
   */
  signedXml?: Buffer;
  error?: string;
  rawResponse?: unknown;
};

export type DteStatusResponse = {
  status: "PENDING" | "SENT" | "ACCEPTED" | "REJECTED" | "WITH_OBJECTIONS" | "ANNULLED";
  trackId: string;
  message?: string;
  rawResponse?: unknown;
};

export type DteVoidRequest = {
  dteType: number;
  folio: number;
  reason: string;
};

/**
 * Request para ceder una factura a una empresa de factoring (Bloque
 * factoring v3). Genera el AEC firmado vía SimpleAPI y lo envía al
 * RPETC del SII. Multi-tenant — el provider es per-tenant.
 */
export type DteCedeRequest = {
  // ── DTE original ──
  dteType: number; // típicamente 33; admite 34/43/46
  dteFolio: number;
  dteIssuerRut: string;
  dteReceiverRut: string;
  /**
   * Razón social del receptor del DTE (deudor de la cesión). Opcional
   * por compatibilidad: SimpleAPI lo extrae solo del XML, pero el
   * adapter directo SII (`sii-direct-cesion`) lo necesita para armar
   * la `<DeclaracionJurada>` Ley 19.983 con el nombre del deudor. Si
   * viene undefined se usa `dteReceiverRut` como fallback (texto
   * declaración pierde el nombre del deudor).
   */
  dteReceiverName?: string;
  dteDate: string; // YYYY-MM-DD (FchEmis del DTE)
  dteTotalAmount: number;
  /** XML completo del DTE original (firmado y aceptado por SII). */
  dteXml: Buffer;

  // ── Cesionario (snapshot al momento de la cesión) ──
  cesionarioRut: string;
  cesionarioRazonSocial: string;
  cesionarioDireccion: string;
  cesionarioEmail: string;

  // ── Cedente (snapshot — datos comerciales del emisor del DTE) ──
  cedenteRazonSocial: string;
  cedenteDireccion: string;
  cedenteEmail: string;

  // ── RUT autorizado a firmar (persona natural del cert digital) ──
  rutAutorizadoNombre: string;
  rutAutorizadoRut: string;

  // ── Términos económicos (V1: cesión TOTAL, secuencia 1) ──
  /** En V1 este monto = dteTotalAmount, redondeado a entero. */
  montoCesion: number;
  /** YYYY-MM-DD — UltimoVencimiento del cobro al deudor. */
  fechaUltimoVencimiento: string;
  emailDeudor?: string;
  otrasCondiciones?: string;

  // ── Contacto en la carátula del AEC ──
  contactNombre: string;
  contactFono?: string;
  contactEmail: string;
};

/**
 * Response del adapter tras el envío del AEC al RPETC.
 * - success=true → AEC firmado y aceptado por RPETC; trackId asignado.
 * - success=false → error en alguno de los pasos; ver `error`.
 *   `aecXml` puede venir con éxito parcial (generado pero no enviado).
 */
export type DteCedeResponse = {
  success: boolean;
  trackId?: string;
  aecXml?: Buffer;
  /** Estado reportado por SimpleAPI tras `cesion/enviar` (informativo). */
  status?: string;
  error?: string;
  rawResponse?: unknown;
};

export interface DteProviderAdapter {
  /**
   * Issue a DTE document
   */
  issue(request: DteIssueRequest): Promise<DteIssueResponse>;

  /**
   * Check the SII status of a DTE
   */
  getStatus(trackId: string): Promise<DteStatusResponse>;

  /**
   * Void/annul a DTE
   */
  void(request: DteVoidRequest): Promise<DteIssueResponse>;

  /**
   * Get the PDF of a DTE
   */
  getPdf(dteType: number, folio: number): Promise<Buffer>;

  /**
   * Get the signed XML of a DTE. Required by SII regulation: the receiver must
   * be able to validate the digital signature independently of the PDF.
   */
  getXml(dteType: number, folio: number): Promise<Buffer>;

  /**
   * Cede una factura a una empresa de factoring: genera el AEC firmado
   * (SimpleAPI/proveedor) y lo envía al RPETC del SII. La consulta del
   * estado oficial vía SOAP se hace aparte (ver `cession-status-poll.service`).
   */
  cede(request: DteCedeRequest): Promise<DteCedeResponse>;
}

/**
 * Stub adapter for development/testing
 * Returns mock successful responses
 */
export class StubDteProvider implements DteProviderAdapter {
  async issue(request: DteIssueRequest): Promise<DteIssueResponse> {
    return {
      success: true,
      trackId: `STUB-${Date.now()}`,
      folio: request.folio,
      pdfUrl: undefined,
      xmlUrl: undefined,
    };
  }

  async getStatus(trackId: string): Promise<DteStatusResponse> {
    return {
      status: "ACCEPTED",
      trackId,
      message: "Stub: auto-accepted",
    };
  }

  async void(_request: DteVoidRequest): Promise<DteIssueResponse> {
    return { success: true, trackId: `STUB-VOID-${Date.now()}` };
  }

  async getPdf(_dteType: number, _folio: number): Promise<Buffer> {
    return Buffer.from("Stub PDF content");
  }

  async getXml(dteType: number, folio: number): Promise<Buffer> {
    return Buffer.from(
      `<?xml version="1.0"?><DTE_STUB type="${dteType}" folio="${folio}"/>`
    );
  }

  async cede(request: DteCedeRequest): Promise<DteCedeResponse> {
    return {
      success: true,
      trackId: `STUB-CES-${Date.now()}`,
      aecXml: Buffer.from(
        `<?xml version="1.0"?><DocumentoAEC_STUB folio="${request.dteFolio}"/>`,
      ),
      status: "STUB",
    };
  }
}

/**
 * Factory to get the configured DTE provider for a given tenant.
 *
 * Reads `TenantDteConfig.provider` (per-tenant) and instantiates the right
 * adapter. Tenants without config → fallback to `StubDteProvider`.
 *
 * NOTE: this function is intentionally async + per-tenant. Callers must:
 *   const provider = await getDteProvider(tenantId);
 */
export async function getDteProvider(tenantId: string): Promise<DteProviderAdapter> {
  const { prisma } = await import("@/lib/prisma");
  const config = await prisma.tenantDteConfig.findUnique({
    where: { tenantId },
  });
  const provider = config?.provider ?? "STUB";

  switch (provider) {
    case "SIMPLEAPI": {
      const { SimpleApiProvider } = await import("./simpleapi.provider");
      return new SimpleApiProvider(tenantId);
    }
    // Future: case "SIMPLEFACTURA": return new SimpleFacturaProvider(tenantId);
    case "STUB":
    default:
      return new StubDteProvider();
  }
}
