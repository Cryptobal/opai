/**
 * DTE Provider Adapter Interface
 * All DTE providers (FACTO, SimpleFactura, etc.) must implement this interface
 */

export type DteIssueRequest = {
  dteType: number; // 33, 34, 39, 52, 56, 61
  folio: number;
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
  reference?: {
    dteType: number;
    folio: number;
    reason: string;
  };
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
}

/**
 * Factory to get the configured DTE provider
 */
export function getDteProvider(): DteProviderAdapter {
  const provider = process.env.DTE_PROVIDER ?? "STUB";

  switch (provider) {
    case "STUB":
      return new StubDteProvider();
    // Future: case "FACTO": return new FactoProvider();
    // Future: case "SIMPLEFACTURA": return new SimpleFacturaProvider();
    default:
      console.warn(`Unknown DTE provider: ${provider}, falling back to STUB`);
      return new StubDteProvider();
  }
}
