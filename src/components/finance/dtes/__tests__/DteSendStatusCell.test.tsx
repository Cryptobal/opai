import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DteSendStatusCell } from "../DteSendStatusCell";
import type { DteRow } from "../shared/types";

function row(over: Partial<DteRow> = {}): DteRow {
  return {
    id: "d1",
    dteType: 33,
    folio: 0,
    receiverRut: "76.000.000-1",
    receiverName: "Pine",
    receiverEmail: null,
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

describe("DteSendStatusCell", () => {
  it("en borrador muestra proforma enviada aunque no haya email de factura", () => {
    render(
      <DteSendStatusCell
        row={row({
          requireProforma: true,
          proformaStatus: "SENT",
          proformaSentAt: "2026-08-20T15:00:00.000Z",
          proformaSentCount: 2,
          proformaLastRecipient: "ana@cliente.cl",
        })}
      />,
    );
    const labels = screen.getAllByRole("img").map((el) => el.getAttribute("aria-label"));
    expect(labels.some((l) => l?.includes("Proforma: enviada"))).toBe(true);
    expect(labels.some((l) => l?.includes("(2 envíos)"))).toBe(true);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByTitle("Sin enviar")).toBeNull();
  });

  it("en emitido sigue usando el sobre de la factura", () => {
    render(
      <DteSendStatusCell
        row={row({
          siiStatus: "ACCEPTED",
          folio: 1234,
          emailSentAt: "2026-08-20T16:00:00.000Z",
          proformaSentCount: 4,
        })}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTitle(/Enviado/)).toBeTruthy();
  });

  it("en emitido sin email muestra Sin enviar", () => {
    render(
      <DteSendStatusCell
        row={row({
          siiStatus: "ACCEPTED",
          folio: 10,
          emailSentAt: null,
        })}
      />,
    );
    expect(screen.getByTitle("Sin enviar")).toBeTruthy();
  });
});
