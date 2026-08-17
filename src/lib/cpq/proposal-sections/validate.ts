/**
 * Validaciones pre-PDF / pre-aprobación de propuesta v2.
 * Las advertencias (montos) no bloquean; los errores sí.
 */
import type { ProposalContentV2 } from "./schema";
import { allGatedSectionsHaveContent, contentCount, emptyGatedSections } from "./ops";
import { deriveComplianceMatrix } from "./compliance-matrix";
import { isAutoSection } from "./oferta-economica";

export type ProposalValidation = {
  code: string;
  level: "error" | "warning";
  message: string;
};

const MONEY_HINT = /(?:\$\s?\d|\bUF\b|\bCLP\b|\bUSD\b)/i;

export function validateProposalContent(
  content: ProposalContentV2,
  ctx?: {
    hasDotacion?: boolean;
    fechaEntrega?: string | null;
    fechaCierreBases?: string | null;
  },
): ProposalValidation[] {
  const out: ProposalValidation[] = [];
  const excl = content.sections.find((s) => s.invariant === "exclusiones");
  if (!excl || !excl.content.trim()) {
    out.push({
      code: "exclusiones_vacias",
      level: "error",
      message: "Exclusiones y supuestos no puede estar vacía. Completala antes del PDF final.",
    });
  }

  if (ctx?.hasDotacion === false) {
    out.push({
      code: "sin_dotacion",
      // Comercial: Dotación puede quedar con nota y la oferta con líneas existentes.
      // Licitación: sigue bloqueando el PDF final sin puestos cotizados.
      level: content.mode === "licitacion" ? "error" : "warning",
      message:
        content.mode === "licitacion"
          ? "La cotización no tiene puestos/dotación CPQ. Agrégalos antes de generar el PDF final."
          : "La cotización no tiene puestos/dotación CPQ. La sección Dotación quedará con nota hasta que exista costeo.",
    });
  }

  if (ctx?.fechaEntrega && ctx.fechaCierreBases) {
    const entrega = ctx.fechaEntrega.slice(0, 10);
    const cierre = ctx.fechaCierreBases.slice(0, 10);
    if (entrega !== cierre) {
      out.push({
        code: "fecha_cierre",
        level: "warning",
        message: `Fecha de entrega del negocio (${entrega}) distinta a la citada en bases (${cierre}). Revisá coherencia.`,
      });
    }
  }

  if (content.mode === "licitacion") {
    for (const s of content.sections) {
      if (s.invariant === "matriz") continue;
      if (isAutoSection(s)) continue;
      if (MONEY_HINT.test(s.content) || MONEY_HINT.test(s.title)) {
        out.push({
          code: "montos_en_cuerpo",
          level: "warning",
          message: `«${s.title}» parece incluir montos ($/UF). En licitación la oferta económica va aparte.`,
        });
      }
    }
  }

  if (content.mode === "licitacion") {
    const { withContent, total } = contentCount(content);
    if (!allGatedSectionsHaveContent(content)) {
      const pendientes = emptyGatedSections(content).map((s) => `«${s.title}»`);
      out.push({
        code: "secciones_pendientes",
        level: "error",
        message: `${withContent} de ${total} secciones con contenido. Faltan: ${pendientes.join(", ")}.`,
      });
    }
  }

  if (content.mode === "licitacion") {
    const matrix = deriveComplianceMatrix(content);
    if (matrix.length === 0) {
      out.push({
        code: "matriz_vacia",
        level: "warning",
        message: "La matriz de cumplimiento no tiene filas: agregá referencias (§bases) en las secciones.",
      });
    }
  }

  return out;
}

export function blockingErrors(validations: ProposalValidation[]): ProposalValidation[] {
  return validations.filter((v) => v.level === "error");
}
