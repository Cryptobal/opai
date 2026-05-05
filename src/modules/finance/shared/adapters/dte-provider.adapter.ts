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
