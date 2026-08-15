/**
 * Operaciones puras sobre el índice de propuesta v2 (testeables, sin I/O).
 * Protege invariantes: Identificación (primera), Exclusiones (no vacía, siempre
 * presente) y Matriz de cumplimiento (anexo, no eliminable).
 */
import type {
  InvariantKey,
  ProposalContentV2,
  ProposalSection,
  ProposalSectionStatus,
} from "./schema";
import { INVARIANT_TITLES, OFERTA_ECONOMICA_KIND, newSectionId } from "./schema";
import { isAutoSection, gateSections, makeOfertaEconomicaSection } from "./oferta-economica";

export class ProposalIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProposalIndexError";
  }
}

function reindex(sections: ProposalSection[]): ProposalSection[] {
  return sections.map((s, i) => ({ ...s, order: i }));
}

function clone(content: ProposalContentV2): ProposalContentV2 {
  return {
    ...content,
    sections: content.sections.map((s) => ({ ...s, sources: [...s.sources] })),
    updatedAt: new Date().toISOString(),
  };
}

function sorted(content: ProposalContentV2): ProposalSection[] {
  return [...content.sections].sort((a, b) => a.order - b.order);
}

function requireSection(content: ProposalContentV2, id: string): ProposalSection {
  const s = content.sections.find((x) => x.id === id);
  if (!s) throw new ProposalIndexError("Sección no encontrada");
  return s;
}

function requireManualSection(content: ProposalContentV2, id: string): ProposalSection {
  const s = requireSection(content, id);
  if (isAutoSection(s)) {
    throw new ProposalIndexError("La oferta económica se genera sola desde el costeo y no se puede editar.");
  }
  return s;
}

function isInvariant(s: ProposalSection, key?: InvariantKey): boolean {
  if (!s.invariant) return false;
  return key ? s.invariant === key : true;
}

function touchStatus(s: ProposalSection): ProposalSectionStatus {
  return s.status === "aprobada" ? "editada" : s.status === "ia" ? "editada" : s.status;
}

function degradeApproved(content: ProposalContentV2): void {
  if (content.status === "aprobada") {
    content.status = "en_revision";
    content.approvedBy = null;
    content.approvedAt = null;
  }
}

export function assertInvariants(content: ProposalContentV2): void {
  const secs = sorted(content);
  const ident = secs.find((s) => s.invariant === "identificacion");
  const excl = secs.find((s) => s.invariant === "exclusiones");
  if (!ident) throw new ProposalIndexError("Falta la sección invariante Identificación");
  if (!excl) throw new ProposalIndexError("Falta la sección invariante Exclusiones y supuestos");
  if (secs[0]?.invariant !== "identificacion") {
    throw new ProposalIndexError("Identificación debe ser la primera sección");
  }
  if (content.mode === "licitacion") {
    const matriz = secs.find((s) => s.invariant === "matriz");
    if (!matriz) throw new ProposalIndexError("Falta la sección invariante Matriz de cumplimiento");
  }
}

export function addSection(
  content: ProposalContentV2,
  input: {
    title: string;
    content?: string;
    ref?: string | null;
    afterId?: string;
    sources?: string[];
    origin?: ProposalSection["origin"];
    fixedKey?: string;
  },
): ProposalContentV2 {
  const title = input.title.trim();
  if (!title) throw new ProposalIndexError("El título de la sección no puede estar vacío");
  const next = clone(content);
  const secs = sorted(next);
  const neu: ProposalSection = {
    id: newSectionId(),
    order: 0,
    title,
    ref: input.ref ?? null,
    status: "ia",
    sources: input.sources ?? [],
    content: input.content ?? "",
    origin: input.origin ?? "ia",
    fixedKey: input.fixedKey,
  };
  let insertAt = secs.length;
  if (input.afterId) {
    const idx = secs.findIndex((s) => s.id === input.afterId);
    if (idx < 0) throw new ProposalIndexError("Sección de referencia no encontrada");
    insertAt = idx + 1;
  } else {
    // Insertar antes de exclusiones/matriz para no romper el anexo.
    const exclIdx = secs.findIndex((s) => s.invariant === "exclusiones");
    if (exclIdx >= 0) insertAt = exclIdx;
  }
  if (insertAt === 0) insertAt = 1; // nunca antes de Identificación
  secs.splice(insertAt, 0, neu);
  next.sections = reindex(secs);
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function mergeSections(
  content: ProposalContentV2,
  idA: string,
  idB: string,
  title?: string,
): ProposalContentV2 {
  const next = clone(content);
  const a = requireManualSection(next, idA);
  const b = requireManualSection(next, idB);
  if (a.invariant || b.invariant) {
    throw new ProposalIndexError("No se pueden fusionar secciones invariantes");
  }
  const merged: ProposalSection = {
    id: a.id,
    order: Math.min(a.order, b.order),
    title: (title ?? a.title).trim() || a.title,
    ref: [a.ref, b.ref].filter(Boolean).join("; ") || null,
    status: "editada",
    sources: [...new Set([...a.sources, ...b.sources])],
    content: [a.content.trim(), b.content.trim()].filter(Boolean).join("\n\n"),
  };
  next.sections = reindex(
    sorted(next)
      .filter((s) => s.id !== a.id && s.id !== b.id)
      .concat([merged])
      .sort((x, y) => x.order - y.order),
  );
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function renameSection(
  content: ProposalContentV2,
  id: string,
  title: string,
): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  const t = title.trim();
  if (!t) throw new ProposalIndexError("El título no puede estar vacío");
  if (s.invariant) {
    throw new ProposalIndexError(
      `No se puede renombrar la sección invariante «${INVARIANT_TITLES[s.invariant]}»`,
    );
  }
  s.title = t;
  s.status = touchStatus(s);
  degradeApproved(next);
  return next;
}

export function reorderSections(content: ProposalContentV2, orderedIds: string[]): ProposalContentV2 {
  const next = clone(content);
  const byId = new Map(next.sections.map((s) => [s.id, s]));
  if (orderedIds.length !== next.sections.length || orderedIds.some((id) => !byId.has(id))) {
    throw new ProposalIndexError("La lista de orden debe incluir todas las secciones exactamente una vez");
  }
  const ident = next.sections.find((s) => s.invariant === "identificacion");
  if (ident && orderedIds[0] !== ident.id) {
    throw new ProposalIndexError("Identificación debe permanecer en primer lugar");
  }
  next.sections = reindex(orderedIds.map((id) => byId.get(id)!));
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function removeSection(content: ProposalContentV2, id: string): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  if (s.invariant) {
    throw new ProposalIndexError(
      `No se puede eliminar la sección invariante «${INVARIANT_TITLES[s.invariant]}»`,
    );
  }
  next.sections = reindex(sorted(next).filter((x) => x.id !== id));
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function moveToExclusiones(
  content: ProposalContentV2,
  id: string,
  note?: string,
): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  if (isInvariant(s, "exclusiones") || isInvariant(s, "identificacion") || isInvariant(s, "matriz")) {
    throw new ProposalIndexError("No se puede mover una invariante a Exclusiones");
  }
  const excl = next.sections.find((x) => x.invariant === "exclusiones");
  if (!excl) throw new ProposalIndexError("Falta Exclusiones y supuestos");
  const block = [`### ${s.title}`, s.content.trim(), note?.trim() ?? ""].filter(Boolean).join("\n\n");
  excl.content = [excl.content.trim(), block].filter(Boolean).join("\n\n");
  excl.status = touchStatus(excl);
  next.sections = reindex(sorted(next).filter((x) => x.id !== id));
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function setSectionContent(
  content: ProposalContentV2,
  id: string,
  body: string,
  opts?: { sources?: string[]; mark?: "ia" | "editada" },
): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  s.content = body;
  if (opts?.sources) s.sources = opts.sources;
  if (opts?.mark === "ia") {
    s.status = s.status === "aprobada" ? "editada" : "ia";
  } else {
    s.status = s.status === "ia" ? "editada" : touchStatus(s);
  }
  degradeApproved(next);
  return next;
}

export function approveSection(content: ProposalContentV2, id: string): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  if (s.invariant === "exclusiones" && !s.content.trim()) {
    throw new ProposalIndexError("Exclusiones y supuestos no puede aprobarse vacía");
  }
  s.status = "aprobada";
  return next;
}

export function unapproveSection(content: ProposalContentV2, id: string): ProposalContentV2 {
  const next = clone(content);
  const s = requireManualSection(next, id);
  if (s.status === "aprobada") s.status = "editada";
  if (next.status === "aprobada") {
    next.status = "en_revision";
    next.approvedBy = null;
    next.approvedAt = null;
  }
  return next;
}

export function replaceIndex(
  content: ProposalContentV2,
  incoming: Array<{
    title: string;
    ref?: string | null;
    content?: string;
    sources?: string[];
    invariant?: InvariantKey;
    kind?: typeof OFERTA_ECONOMICA_KIND | "dotacion";
    origin?: ProposalSection["origin"];
    fixedKey?: string;
  }>,
): ProposalContentV2 {
  const next = clone(content);
  const keepByInv = new Map(
    next.sections.filter((s) => s.invariant).map((s) => [s.invariant!, s]),
  );
  const prevAuto = next.sections.find(isAutoSection);
  const prevDotacion = next.sections.find((s) => s.kind === "dotacion");
  const built: ProposalSection[] = [];
  const seenInv = new Set<InvariantKey>();
  let sawAuto = false;

  for (const row of incoming) {
    if (row.kind === OFERTA_ECONOMICA_KIND) {
      sawAuto = true;
      built.push(prevAuto ? { ...prevAuto, sources: [...prevAuto.sources], origin: "auto" } : makeOfertaEconomicaSection());
      continue;
    }
    if (row.kind === "dotacion") {
      built.push({
        id: prevDotacion?.id ?? newSectionId(),
        order: 0,
        title: row.title.trim() || "Dotación propuesta",
        ref: row.ref ?? null,
        status: prevDotacion?.status ?? "ia",
        sources: row.sources ?? prevDotacion?.sources ?? ["costeo", "puestos"],
        content: row.content ?? prevDotacion?.content ?? "",
        kind: "dotacion",
        origin: "auto",
      });
      continue;
    }
    const inv = row.invariant;
    if (inv) {
      seenInv.add(inv);
      const prev = keepByInv.get(inv);
      built.push({
        id: prev?.id ?? newSectionId(),
        order: 0,
        title: INVARIANT_TITLES[inv],
        ref: row.ref ?? prev?.ref ?? null,
        status: prev && prev.content.trim() && !row.content ? prev.status : "ia",
        sources: row.sources ?? prev?.sources ?? [],
        content: (row.content ?? prev?.content ?? "").trim()
          ? (row.content ?? prev?.content ?? "")
          : inv === "exclusiones"
            ? prev?.content ||
              "Pendiente: se completará con lo no cubierto por las bases y la cotización."
            : "",
        invariant: inv,
        origin: row.origin ?? prev?.origin ?? (inv === "matriz" ? "auto" : "ia"),
        fixedKey: row.fixedKey ?? prev?.fixedKey,
      });
    } else {
      built.push({
        id: newSectionId(),
        order: 0,
        title: row.title.trim(),
        ref: row.ref ?? null,
        status: "ia",
        sources: row.sources ?? [],
        content: row.content ?? "",
        origin: row.origin ?? "ia",
        fixedKey: row.fixedKey,
      });
    }
  }

  for (const key of ["identificacion", "exclusiones", "matriz"] as InvariantKey[]) {
    if (next.mode !== "licitacion" && key === "matriz") continue;
    if (!seenInv.has(key)) {
      const prev = keepByInv.get(key);
      const fallback: ProposalSection = prev
        ? { ...prev, sources: [...prev.sources] }
        : {
            id: newSectionId(),
            order: 0,
            title: INVARIANT_TITLES[key],
            ref: null,
            status: "ia",
            sources: [],
            content:
              key === "exclusiones"
                ? "Pendiente: se completará con lo no cubierto por las bases y la cotización."
                : "",
            invariant: key,
          };
      if (key === "identificacion") built.unshift(fallback);
      else built.push(fallback);
    }
  }

  if (!sawAuto) {
    const auto = prevAuto ? { ...prevAuto, sources: [...prevAuto.sources] } : makeOfertaEconomicaSection();
    const matrizIdx = built.findIndex((s) => s.invariant === "matriz");
    if (matrizIdx >= 0) built.splice(matrizIdx, 0, auto);
    else built.push(auto);
  }

  const identIdx = built.findIndex((s) => s.invariant === "identificacion");
  if (identIdx > 0) {
    const [ident] = built.splice(identIdx, 1);
    built.unshift(ident);
  }

  next.sections = reindex(built);
  next.status = "borrador";
  degradeApproved(next);
  assertInvariants(next);
  return next;
}

export function allSectionsApproved(content: ProposalContentV2): boolean {
  const gated = gateSections(content.sections);
  return gated.length > 0 && gated.every((s) => s.status === "aprobada");
}

export function setProposalDocStatus(
  content: ProposalContentV2,
  status: ProposalContentV2["status"],
  actor?: { userId: string },
): ProposalContentV2 {
  const next = clone(content);
  if (status === "aprobada") {
    if (!allSectionsApproved(next)) {
      throw new ProposalIndexError("No se puede aprobar: faltan secciones por aprobar.");
    }
    const excl = next.sections.find((s) => s.invariant === "exclusiones");
    if (!excl?.content.trim()) {
      throw new ProposalIndexError("Exclusiones y supuestos no puede estar vacía.");
    }
    next.status = "aprobada";
    next.approvedBy = actor?.userId ?? null;
    next.approvedAt = new Date().toISOString();
  } else if (status === "enviada") {
    if (content.mode === "licitacion" && next.status !== "aprobada") {
      throw new ProposalIndexError("Solo se puede marcar enviada una propuesta de licitación aprobada.");
    }
    if (content.mode === "comercial" && next.status === "borrador") {
      next.status = "en_revision";
    }
    next.status = "enviada";
    next.sentBy = actor?.userId ?? null;
    next.sentAt = new Date().toISOString();
  } else {
    next.status = status;
    if (status === "borrador" || status === "en_revision") {
      next.approvedBy = null;
      next.approvedAt = null;
    }
  }
  return next;
}

export function approvedCount(content: ProposalContentV2): { approved: number; total: number } {
  const gated = gateSections(content.sections);
  return {
    approved: gated.filter((s) => s.status === "aprobada").length,
    total: gated.length,
  };
}
