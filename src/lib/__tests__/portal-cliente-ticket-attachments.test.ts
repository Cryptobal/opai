import { describe, it, expect } from "vitest";
import { normalizeTicketAttachments } from "@/lib/portal-cliente-ticket-attachments";

describe("normalizeTicketAttachments", () => {
  it("retorna [] para input no-array o nulo", () => {
    expect(normalizeTicketAttachments(null)).toEqual([]);
    expect(normalizeTicketAttachments(undefined)).toEqual([]);
    expect(normalizeTicketAttachments("foo")).toEqual([]);
    expect(normalizeTicketAttachments({ foo: "bar" })).toEqual([]);
  });

  it("filtra items sin id/fileName/fileUrl", () => {
    const out = normalizeTicketAttachments([
      { id: "1", fileName: "a.pdf", fileUrl: "https://cdn/x" },
      { id: "", fileName: "x", fileUrl: "https://cdn/y" },
      { fileName: "y", fileUrl: "https://cdn/y" },
      { id: "2", fileName: "", fileUrl: "https://cdn/z" },
      { id: "3", fileName: "c.pdf", fileUrl: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("1");
  });

  it("rechaza URLs no-http (ej: data:, javascript:, file://)", () => {
    const out = normalizeTicketAttachments([
      { id: "1", fileName: "a.pdf", fileUrl: "data:application/pdf;base64,xxx" },
      { id: "2", fileName: "b.pdf", fileUrl: "javascript:alert(1)" },
      { id: "3", fileName: "c.pdf", fileUrl: "file:///etc/passwd" },
      { id: "4", fileName: "d.pdf", fileUrl: "https://cdn/ok" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("4");
  });

  it("normaliza fileType y fileSize con defaults seguros", () => {
    const out = normalizeTicketAttachments([
      {
        id: "1",
        fileName: "foto.jpg",
        fileUrl: "https://cdn/foto.jpg",
        // fileType/fileSize faltan
      },
      {
        id: "2",
        fileName: "doc.pdf",
        fileUrl: "https://cdn/doc.pdf",
        fileType: "application/pdf",
        fileSize: -100,
      },
    ]);
    expect(out[0].fileType).toBe("application/octet-stream");
    expect(out[0].fileSize).toBe(0);
    expect(out[1].fileType).toBe("application/pdf");
    expect(out[1].fileSize).toBe(0); // clamped to >= 0
  });

  it("aplica límite de 5 adjuntos", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `att-${i}`,
      fileName: `f${i}.pdf`,
      fileUrl: `https://cdn/${i}`,
    }));
    const out = normalizeTicketAttachments(many);
    expect(out).toHaveLength(5);
    expect(out[0].id).toBe("att-0");
    expect(out[4].id).toBe("att-4");
  });

  it("descarta campos ajenos (no se cuelan en el shape final)", () => {
    const out = normalizeTicketAttachments([
      {
        id: "1",
        fileName: "a.pdf",
        fileUrl: "https://cdn/a",
        fileType: "application/pdf",
        fileSize: 1024,
        // Intentos de inyección:
        __proto__: { hacked: true },
        ticketId: "victim",
        isInternal: true,
      },
    ]);
    const item = out[0] as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(
      ["fileName", "fileSize", "fileType", "fileUrl", "id"].sort(),
    );
    expect(item.ticketId).toBeUndefined();
    expect(item.isInternal).toBeUndefined();
  });
});
