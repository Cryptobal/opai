import { describe, expect, it } from "vitest";
import {
  applyBillingDocSent,
  mapIssuedApiDteToRow,
  parseBillingSendFields,
  parseDraftProformaStatus,
} from "../shared/map-issued-dte";
import type { DteRow } from "../shared/types";

function baseRow(over: Partial<DteRow> = {}): DteRow {
  return {
    id: "d1",
    dteType: 33,
    folio: 0,
    receiverRut: "76.000.000-1",
    receiverName: "Pine",
    receiverEmail: "facturacion@pine.cl",
    netAmount: 1000,
    taxAmount: 190,
    totalAmount: 1190,
    siiStatus: "DRAFT",
    currency: "CLP",
    linesCount: 1,
    createdAt: "2026-08-20T12:00:00.000Z",
    emailSentAt: null,
    emailStatus: null,
    referenceType: null,
    referenceFolio: null,
    ...over,
  };
}

describe("parseDraftProformaStatus", () => {
  it("acepta estados conocidos y cae a NONE", () => {
    expect(parseDraftProformaStatus("SENT")).toBe("SENT");
    expect(parseDraftProformaStatus("VIEWED")).toBe("VIEWED");
    expect(parseDraftProformaStatus("bogus")).toBe("NONE");
    expect(parseDraftProformaStatus(null)).toBe("NONE");
  });
});

describe("parseBillingSendFields", () => {
  it("mapea conteos y fechas de proforma / EP", () => {
    const fields = parseBillingSendFields({
      requireProforma: true,
      proformaStatus: "SENT",
      proformaSentAt: "2026-08-20T15:00:00.000Z",
      proformaSentCount: 2,
      proformaLastRecipient: "ana@cliente.cl",
      requireEstadoPago: false,
      estadoPagoStatus: "NONE",
    });
    expect(fields.requireProforma).toBe(true);
    expect(fields.proformaStatus).toBe("SENT");
    expect(fields.proformaSentCount).toBe(2);
    expect(fields.proformaLastRecipient).toBe("ana@cliente.cl");
    expect(fields.estadoPagoStatus).toBe("NONE");
    expect(fields.estadoPagoSentCount).toBe(0);
  });
});

describe("mapIssuedApiDteToRow", () => {
  it("conserva envío de proforma aunque no haya email de factura", () => {
    const row = mapIssuedApiDteToRow({
      id: "abc",
      dteType: 33,
      folio: 0,
      receiverRut: "1-9",
      receiverName: "Pine",
      receiverEmail: null,
      netAmount: 10,
      taxAmount: 0,
      totalAmount: 10,
      siiStatus: "DRAFT",
      currency: "CLP",
      lines: [{}],
      createdAt: "2026-08-20T12:00:00.000Z",
      emailSentAt: null,
      emailStatus: null,
      requireProforma: true,
      proformaStatus: "SENT",
      proformaSentCount: 2,
      proformaSentAt: "2026-08-20T15:00:00.000Z",
      proformaLastRecipient: "ana@cliente.cl",
    });
    expect(row.emailSentAt).toBeNull();
    expect(row.siiStatus).toBe("DRAFT");
    expect(row.proformaSentCount).toBe(2);
    expect(row.proformaStatus).toBe("SENT");
    expect(row.linesCount).toBe(1);
  });
});

describe("applyBillingDocSent", () => {
  it("incrementa proforma y deja EP intacto", () => {
    const next = applyBillingDocSent(
      baseRow({ proformaSentCount: 1, estadoPagoSentCount: 0 }),
      "PROFORMA",
      "2026-08-20T18:00:00.000Z",
      "nuevo@cliente.cl",
    );
    expect(next.proformaStatus).toBe("SENT");
    expect(next.proformaSentCount).toBe(2);
    expect(next.proformaLastRecipient).toBe("nuevo@cliente.cl");
    expect(next.estadoPagoSentCount).toBe(0);
  });

  it("incrementa estado de pago", () => {
    const next = applyBillingDocSent(
      baseRow({ estadoPagoSentCount: 0 }),
      "ESTADO_DE_PAGO",
      "2026-08-20T18:00:00.000Z",
    );
    expect(next.estadoPagoStatus).toBe("SENT");
    expect(next.estadoPagoSentCount).toBe(1);
  });
});
