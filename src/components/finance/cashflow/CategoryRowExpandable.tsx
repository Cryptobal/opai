"use client";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CategoryItemsList } from "./CategoryItemsList";
import { CategoryAutoSourcesList } from "./CategoryAutoSourcesList";

const CATEGORIES_WITH_GENERATOR = new Set([
  "ING_VENTA_CONTRATO",
  "EGR_SUELDO",
  "EGR_TURNO_EXTRA",
  "EGR_IVA_F29",
]);

interface Props {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryKind: "INCOME" | "EXPENSE";
  canManage: boolean;
  /** Render del header (las celdas de la fila plana actual). */
  header: ReactNode;
  /** Número de columnas que abarca el header (excluye la del chevron). */
  colSpan: number;
}

/**
 * Wrapper expandible para una fila de categoría en la tabla de configuración.
 * Render: una `<tr>` con el chevron + el header pasado, y debajo (cuando
 * está expandido) otra `<tr>` con un panel que muestra fuentes automáticas
 * (si la categoría tiene generator) y la lista de items manuales con CRUD.
 */
export function CategoryRowExpandable({
  categoryId,
  categoryCode,
  categoryName,
  categoryKind,
  canManage,
  header,
  colSpan,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasGenerator = CATEGORIES_WITH_GENERATOR.has(categoryCode);

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20">
        <td className="p-2 w-6">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-0.5 rounded hover:bg-muted/40"
            aria-label={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </td>
        {header}
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={colSpan + 1} className="p-3">
            <div className="space-y-3">
              {hasGenerator && <CategoryAutoSourcesList categoryId={categoryId} />}
              <CategoryItemsList
                categoryId={categoryId}
                categoryCode={categoryCode}
                categoryName={categoryName}
                categoryKind={categoryKind}
                canManage={canManage}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
