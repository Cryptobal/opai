import { describe, expect, it } from "vitest";
import { renderDigestPdf, renderVisitReportPdf } from "../render";
import type { DigestReportData, VisitReportData } from "../types";

const visitData: VisitReportData = {
  kind: "visits",
  companyName: "GARD Security SpA",
  commercialName: "GARD Security",
  accountName: "Cliente Demo",
  periodLabel: "Semana 33 · 10/08/2026 – 16/08/2026",
  generatedAtLabel: "24/08/2026, 08:00",
  installations: [
    {
      id: "i1",
      name: "Bodega Norte",
      address: "Av. Demo 100, Santiago",
      visits: [
        {
          id: "v1",
          installationId: "i1",
          installationName: "Bodega Norte",
          supervisorName: "Ana Pérez",
          checkInAt: "2026-08-12T14:00:00.000Z",
          checkOutAt: "2026-08-12T15:10:00.000Z",
          durationMinutes: 70,
          installationState: "Ordenada",
          generalComments: "Visita de rutina sin novedades mayores.",
          findings: [
            { description: "Extintor por vencer", status: "Abierto", category: "docs" },
          ],
        },
      ],
    },
  ],
};

const digestData: DigestReportData = {
  kind: "digest",
  companyName: "GARD Security SpA",
  commercialName: "GARD Security",
  accountName: "Cliente Demo",
  installationName: "Bodega Norte",
  installationAddress: "Av. Demo 100, Santiago",
  periodLabel: "Semana 33 · 10/08/2026 – 16/08/2026",
  generatedAtLabel: "24/08/2026, 08:00",
  sections: {
    includeAsistencia: true,
    includeCobertura: true,
    includeRondas: true,
    includeIncidentes: true,
    includeVisitas: true,
  },
  kpis: {
    asistenciaPct: 96,
    coberturaPct: 94,
    slotsCovered: 47,
    slotsTotal: 50,
    rondasCompleted: 28,
    rondasTotal: 30,
    rondasPct: 93,
    incidentesTotal: 2,
    incidentesResueltos: 1,
    incidentesAbiertos: 1,
    visitasCount: 1,
  },
  visits: visitData.installations[0].visits,
  incidentes: [
    {
      code: "TK-101",
      title: "Acceso: puerta entreabierta",
      createdAt: "2026-08-13T03:12:00.000Z",
      resolved: true,
      statusLabel: "Resuelto",
    },
    {
      code: "TK-102",
      title: "Iluminación perimetral",
      createdAt: "2026-08-14T22:40:00.000Z",
      resolved: false,
      statusLabel: "Abierto",
    },
  ],
};

describe("client-report PDF render", () => {
  it("renders a visits PDF with %PDF header", async () => {
    const buf = await renderVisitReportPdf(visitData);
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(500);
  }, 30_000);

  it("renders a digest PDF with %PDF header", async () => {
    const buf = await renderDigestPdf(digestData);
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(500);
  }, 30_000);
});
