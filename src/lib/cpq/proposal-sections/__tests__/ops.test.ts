import { describe, expect, it } from "vitest";
import {
  emptyProposalV2,
  migrateV1ToV2,
  readProposalContent,
  isProposalContentV1,
  isProposalContentV2,
} from "../schema";
import {
  addSection,
  approveSection,
  mergeSections,
  moveToExclusiones,
  ProposalIndexError,
  removeSection,
  renameSection,
  reorderSections,
  replaceIndex,
  setProposalDocStatus,
  setSectionContent,
  unapproveSection,
} from "../ops";
import { deriveComplianceMatrix } from "../compliance-matrix";
import { validateProposalContent } from "../validate";
import {
  buildInstitutionalIndexItems,
  composeCommercialIndex,
  detectHeadingsFromCorpus,
} from "../propose-index";

describe("proposal-sections schema / migrador v1→v2", () => {
  it("reconoce v1 y migra conservando legacyV1", () => {
    const v1 = {
      descripcionBreve: "Servicio 24/7",
      resumenEjecutivo: "Resumen",
      analisisNecesidades: "Análisis",
      sectoresRelevantes: ["Retail"],
    };
    expect(isProposalContentV1(v1)).toBe(true);
    const v2 = migrateV1ToV2(v1, "comercial");
    expect(v2.version).toBe(2);
    expect(v2.legacyV1).toEqual(v1);
    expect(v2.sections[0]?.content).toBe("Servicio 24/7");
    expect(v2.sections.some((s) => s.content.includes("Resumen"))).toBe(true);
    expect(isProposalContentV2(v2)).toBe(true);
  });

  it("readProposalContent es idempotente sobre v2", () => {
    const v2 = emptyProposalV2("licitacion");
    expect(readProposalContent(v2, "licitacion")).toEqual(v2);
  });

  it("readProposalContent migra v1 en modo licitación sin perder prosa", () => {
    const v2 = readProposalContent(
      { descripcionBreve: "Acme SpA", resumenEjecutivo: "Texto largo" },
      "licitacion",
    );
    expect(v2.mode).toBe("licitacion");
    expect(v2.sections[0]?.invariant).toBe("identificacion");
    expect(v2.sections[0]?.content).toBe("Acme SpA");
    expect(v2.sections.some((s) => s.title === "Resumen ejecutivo")).toBe(true);
  });

  it("crea la plantilla institucional completa con orígenes en ambos modos", () => {
    const comercial = emptyProposalV2("comercial");
    const licitacion = emptyProposalV2("licitacion");
    expect(comercial.sections.map((s) => s.title)).toEqual([
      "Identificación",
      "Resumen ejecutivo",
      "Quiénes somos y organigrama",
      "Comprensión del servicio",
      "Dotación",
      "Uniformes y EPP",
      "Capacitación",
      "OPAI y SLA",
      "Supervisión y contingencias",
      "Enfoque preventivo",
      "Carta Gantt",
      "Experiencia y certificaciones",
      "Matriz de cumplimiento",
      "Exclusiones y supuestos",
      "Oferta económica — apertura completa",
    ]);
    expect(licitacion.sections.at(-1)?.invariant).toBe("matriz");
    expect(comercial.sections.find((s) => s.title === "Dotación")?.origin).toBe("auto");
    expect(comercial.sections.find((s) => s.title === "Capacitación")?.origin).toBe(
      "fija_empresa",
    );
  });
});

describe("ops de índice e invariantes", () => {
  it("Identificación queda primera al agregar secciones", () => {
    let c = emptyProposalV2("licitacion");
    c = addSection(c, { title: "Suministro de cámaras" });
    expect(c.sections[0]?.invariant).toBe("identificacion");
    expect(c.sections.some((s) => s.title === "Suministro de cámaras")).toBe(true);
    expect(c.sections.some((s) => s.invariant === "exclusiones")).toBe(true);
    expect(c.sections.some((s) => s.invariant === "matriz")).toBe(true);
  });

  it("rechaza eliminar / fusionar / renombrar invariantes", () => {
    const c = emptyProposalV2("licitacion");
    const ident = c.sections.find((s) => s.invariant === "identificacion")!;
    const excl = c.sections.find((s) => s.invariant === "exclusiones")!;
    expect(() => removeSection(c, ident.id)).toThrow(ProposalIndexError);
    expect(() => mergeSections(c, ident.id, excl.id)).toThrow(/invariantes/);
    expect(() => renameSection(c, ident.id, "Otro")).toThrow(/invariante/);
  });

  it("rechaza reordenar Identificación fuera del primer lugar", () => {
    let c = emptyProposalV2("licitacion");
    c = addSection(c, { title: "CCTV" });
    const ids = c.sections.map((s) => s.id);
    const swapped = [ids[1], ids[0], ...ids.slice(2)];
    expect(() => reorderSections(c, swapped)).toThrow(/primer/);
  });

  it("moveToExclusiones mueve el cuerpo y borra la sección origen", () => {
    let c = emptyProposalV2("licitacion");
    c = addSection(c, { title: "Cámaras", content: "Suministro de 12 cámaras." });
    const cam = c.sections.find((s) => s.title === "Cámaras")!;
    c = moveToExclusiones(c, cam.id);
    expect(c.sections.some((s) => s.id === cam.id)).toBe(false);
    const excl = c.sections.find((s) => s.invariant === "exclusiones")!;
    expect(excl.content).toContain("Cámaras");
    expect(excl.content).toContain("12 cámaras");
  });

  it("editar o regenerar una sección aprobada la deja en editada y saca la propuesta de aprobada", () => {
    let c = emptyProposalV2("licitacion");
    const ident = c.sections[0]!;
    c = setSectionContent(c, ident.id, "Cliente X", { mark: "ia" });
    c = { ...c, sections: c.sections.map((s) => ({ ...s, status: "aprobada" as const })), status: "aprobada" };
    c = setSectionContent(c, ident.id, "Cliente Y");
    expect(c.sections[0]?.status).toBe("editada");
    expect(c.status).toBe("en_revision");
  });

  it("approve/unapprove de exclusiones vacía falla", () => {
    let c = emptyProposalV2("licitacion");
    const excl = c.sections.find((s) => s.invariant === "exclusiones")!;
    c = setSectionContent(c, excl.id, "   ");
    expect(() => approveSection(c, excl.id)).toThrow(/vacía/);
    c = setSectionContent(c, excl.id, "Fuera de alcance: obra civil.");
    c = approveSection(c, excl.id);
    expect(c.sections.find((s) => s.id === excl.id)?.status).toBe("aprobada");
    c = unapproveSection(c, excl.id);
    expect(c.sections.find((s) => s.id === excl.id)?.status).toBe("editada");
  });

  it("replaceIndex conserva invariantes aunque el modelo las omita", () => {
    const c = emptyProposalV2("licitacion");
    const next = replaceIndex(c, [{ title: "CCTV nuevo", ref: "§4.1" }]);
    expect(next.sections[0]?.invariant).toBe("identificacion");
    expect(next.sections.some((s) => s.invariant === "exclusiones")).toBe(true);
    expect(next.sections.some((s) => s.invariant === "matriz")).toBe(true);
    expect(next.sections.some((s) => s.title === "CCTV nuevo")).toBe(true);
  });

  it("replaceIndex conserva el origen propuesto", () => {
    const c = emptyProposalV2("licitacion");
    const next = replaceIndex(c, [
      { title: "CCTV nuevo", ref: "§4.1", origin: "bases" },
    ]);
    expect(next.sections.find((s) => s.title === "CCTV nuevo")?.origin).toBe("bases");
  });
});

describe("composición de índice institucional", () => {
  it("expone el cuerpo institucional y compone el índice comercial", () => {
    const institutional = buildInstitutionalIndexItems();
    expect(institutional[0]).toMatchObject({ title: "Resumen ejecutivo", origin: "ia" });
    expect(institutional.find((s) => s.title === "OPAI y SLA")?.origin).toBe("fija_empresa");
    expect(composeCommercialIndex().map((s) => s.title)).toEqual(
      emptyProposalV2("comercial").sections.map((s) => s.title),
    );
  });

  it("agrega capítulos de bases tras el cuerpo institucional y deduplica títulos similares", () => {
    const items = detectHeadingsFromCorpus({
      dealId: "d1",
      chunks: [
        {
          fileId: "f1",
          fileName: "bases.pdf",
          kind: "bases",
          tipoCodigo: "bases_tecnicas",
          status: "ok",
          text: "1. Capacitación del personal\n2. Control de acceso especializado",
          truncated: false,
        },
      ],
      truncated: false,
      hasBases: true,
      basesError: null,
      banner: "",
    });
    expect(items.filter((s) => s.title.toLowerCase().includes("capacitación"))).toHaveLength(1);
    const base = items.find((s) => s.title === "Control de acceso especializado");
    expect(base?.origin).toBe("bases");
    expect(items.indexOf(base!)).toBeGreaterThan(
      items.findIndex((s) => s.title === "Experiencia y certificaciones"),
    );
  });
});

describe("matriz de cumplimiento", () => {
  it("deriva CUMPLE/PARCIAL/EXCLUIDO desde refs y exclusiones", () => {
    let c = emptyProposalV2("licitacion");
    c = addSection(c, { title: "OS10", content: "Se da cumplimiento al OS10.", ref: "§3.1" });
    c = addSection(c, {
      title: "Cámaras",
      content: "Suministro parcial sujeto a visita.",
      ref: "§4.2",
    });
    const cam = c.sections.find((s) => s.title === "Cámaras")!;
    c = moveToExclusiones(c, cam.id, "§4.2");
    const rows = deriveComplianceMatrix(c);
    expect(rows.some((r) => r.ref.includes("3.1") && r.level === "CUMPLE")).toBe(true);
    expect(rows.some((r) => r.level === "EXCLUIDO")).toBe(true);
  });
});

describe("validaciones pre-PDF", () => {
  it("bloquea exclusiones vacías, sin dotación y secciones no aprobadas", () => {
    let c = emptyProposalV2("licitacion");
    const excl = c.sections.find((s) => s.invariant === "exclusiones")!;
    c = setSectionContent(c, excl.id, "   ");
    const v = validateProposalContent(c, { hasDotacion: false });
    expect(v.some((x) => x.code === "exclusiones_vacias" && x.level === "error")).toBe(true);
    expect(v.some((x) => x.code === "sin_dotacion")).toBe(true);
    expect(v.some((x) => x.code === "secciones_pendientes")).toBe(true);
  });

  it("advierte montos en modo licitación sin bloquear", () => {
    let c = emptyProposalV2("licitacion");
    const ident = c.sections[0]!;
    c = setSectionContent(c, ident.id, "Inversión de $1.000.000 y 10 UF.");
    const v = validateProposalContent(c, { hasDotacion: true });
    expect(v.some((x) => x.code === "montos_en_cuerpo" && x.level === "warning")).toBe(true);
  });

  it("setProposalDocStatus exige 100% aprobado y exclusiones con texto", () => {
    let c = emptyProposalV2("licitacion");
    expect(() => setProposalDocStatus(c, "aprobada")).toThrow(/secciones/);
    c = {
      ...c,
      sections: c.sections.map((s) => ({
        ...s,
        status: "aprobada" as const,
        content: s.invariant === "exclusiones" ? "Fuera de alcance: obra civil." : "ok",
      })),
    };
    const approved = setProposalDocStatus(c, "aprobada", { userId: "u1" });
    expect(approved.status).toBe("aprobada");
    expect(approved.approvedBy).toBe("u1");
    const sent = setProposalDocStatus(approved, "enviada", { userId: "u1" });
    expect(sent.status).toBe("enviada");
    expect(sent.sentBy).toBe("u1");
  });

  it("modo comercial no exige aprobación de secciones para PDF, aprobación ni envío", () => {
    const c = emptyProposalV2("comercial");
    const validations = validateProposalContent(c, { hasDotacion: true });
    expect(validations.some((x) => x.code === "secciones_pendientes")).toBe(false);

    const approved = setProposalDocStatus(c, "aprobada", { userId: "u1" });
    expect(approved.status).toBe("aprobada");

    const sent = setProposalDocStatus(c, "enviada", { userId: "u1" });
    expect(sent.status).toBe("enviada");
    expect(sent.sentBy).toBe("u1");
  });
});

describe("oferta económica automática", () => {
  it("está en el índice comercial y de licitación", () => {
    const lic = emptyProposalV2("licitacion");
    const com = emptyProposalV2("comercial");
    expect(lic.sections.some((s) => s.kind === "oferta_economica")).toBe(true);
    expect(com.sections.some((s) => s.kind === "oferta_economica")).toBe(true);
    const matrizIdx = lic.sections.findIndex((s) => s.invariant === "matriz");
    const ofertaIdx = lic.sections.findIndex((s) => s.kind === "oferta_economica");
    expect(ofertaIdx).toBeGreaterThan(-1);
    expect(ofertaIdx).toBeLessThan(matrizIdx);
  });

  it("queda fuera del gate y del contador", () => {
    let c = emptyProposalV2("licitacion");
    const excl = c.sections.find((s) => s.invariant === "exclusiones")!;
    c = setSectionContent(c, excl.id, "Fuera de alcance: obra civil.");
    c = {
      ...c,
      sections: c.sections.map((s) =>
        s.kind === "oferta_economica"
          ? s
          : {
              ...s,
              status: "aprobada" as const,
              content: s.invariant === "exclusiones" ? excl.content : "ok",
            },
      ),
    };
    expect(c.sections.find((s) => s.kind === "oferta_economica")?.status).toBe("ia");
    const approved = setProposalDocStatus(c, "aprobada", { userId: "u1" });
    expect(approved.status).toBe("aprobada");
    const v = validateProposalContent(approved, { hasDotacion: true });
    expect(v.some((x) => x.code === "secciones_pendientes")).toBe(false);
  });

  it("rechaza editar / aprobar / eliminar la sección auto", () => {
    const c = emptyProposalV2("comercial");
    const auto = c.sections.find((s) => s.kind === "oferta_economica")!;
    expect(() => setSectionContent(c, auto.id, "no")).toThrow(/costeo/);
    expect(() => approveSection(c, auto.id)).toThrow(/costeo/);
    expect(() => removeSection(c, auto.id)).toThrow(/costeo/);
  });

  it("replaceIndex conserva la oferta económica aunque el modelo la omita", () => {
    const c = emptyProposalV2("licitacion");
    const next = replaceIndex(c, [{ title: "CCTV nuevo", ref: "§4.1" }]);
    expect(next.sections.some((s) => s.kind === "oferta_economica")).toBe(true);
    const matrizIdx = next.sections.findIndex((s) => s.invariant === "matriz");
    const ofertaIdx = next.sections.findIndex((s) => s.kind === "oferta_economica");
    expect(ofertaIdx).toBeLessThan(matrizIdx);
  });
});
