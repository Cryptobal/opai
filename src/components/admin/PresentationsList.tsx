"use client";

/**
 * Stub mínimo de PresentationsList.
 *
 * Este componente lo introdujo `DocumentosContent.tsx` (commits recientes
 * 2026-05) pero el archivo nunca llegó al repo, lo que rompía el build de
 * Vercel ("Cannot find module '@/components/admin/PresentationsList'").
 *
 * Como `DocumentosContent` no está referenciado desde ninguna page todavía
 * (es código en preparación), dejamos un stub que acepta los props
 * esperados y renderiza un placeholder. Cuando se implemente la versión
 * real, esto se sobrescribe sin afectar nada más.
 */

interface PresentationsListProps {
  presentations: unknown[];
  initialFilter?: string;
}

export function PresentationsList({ presentations, initialFilter: _initialFilter }: PresentationsListProps) {
  return (
    <div className="rounded-ds-md border border-border bg-card p-4 text-[13px] text-ds-text-3">
      Listado de presentaciones — pendiente de implementación.
      {presentations.length > 0 ? ` (${presentations.length} items)` : ""}
    </div>
  );
}
