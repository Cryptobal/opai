"use client";

import Link from "next/link";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import PsychBandBadge from "./PsychBandBadge";
import PsychDeleteDialog from "./PsychDeleteDialog";

interface Row {
  id: string;
  targetName: string;
  targetRut: string | null;
  status: string;
  createdAt: string;
  result: { globalScore: number; band: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Enviado",
  STARTED: "En progreso",
  SUBMITTED: "Finalizado",
  SCORED: "Resultado listo",
  REVIEWED: "Revisado",
  EXPIRED: "Expirado",
};

interface Props {
  rows: Row[];
  canDelete?: boolean;
  onDeleted?: () => void;
}

export default function PsychAssessmentsTable({
  rows,
  canDelete = false,
  onDeleted,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingRow = rows.find((r) => r.id === deletingId);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
        Aún no hay evaluaciones. Usa el botón &ldquo;Nueva evaluación&rdquo;.
      </div>
    );
  }
  return (
    <>
      {/* Mobile: cards stackeadas */}
      <div className="md:hidden grid grid-cols-1 gap-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border bg-card p-4 flex items-start gap-3"
          >
            <Link
              href={`/personas/psicolaboral/${r.id}`}
              className="flex-1 min-w-0 active:opacity-70"
            >
              <p className="font-medium text-foreground truncate">{r.targetName}</p>
              {r.targetRut ? (
                <p className="text-xs text-muted-foreground">{r.targetRut}</p>
              ) : null}
              <p className="text-xs text-muted-foreground mt-1">
                {STATUS_LABEL[r.status] ?? r.status} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("es-CL")}
              </p>
            </Link>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {r.result ? (
                <span className="text-lg font-semibold text-foreground">
                  {r.result.globalScore.toFixed(1)}
                </span>
              ) : null}
              <PsychBandBadge band={r.result?.band ?? null} />
              {canDelete ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDeletingId(r.id);
                  }}
                  className="text-status-danger-fg dark:text-status-danger-fg hover:bg-status-danger-soft rounded p-1"
                  aria-label="Eliminar"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: tabla clásica */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Evaluado</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Score</th>
              <th className="text-left px-4 py-3">Banda</th>
              <th className="text-left px-4 py-3">Creado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border hover:bg-muted/50"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{r.targetName}</div>
                  {r.targetRut ? (
                    <div className="text-xs text-muted-foreground">{r.targetRut}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-foreground/90">
                  {STATUS_LABEL[r.status] ?? r.status}
                </td>
                <td className="px-4 py-3 text-foreground font-medium">
                  {r.result ? r.result.globalScore.toFixed(1) : "—"}
                </td>
                <td className="px-4 py-3">
                  <PsychBandBadge band={r.result?.band ?? null} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("es-CL")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/personas/psicolaboral/${r.id}`}
                      className="text-foreground/90 underline text-xs"
                    >
                      Ver
                    </Link>
                    {canDelete ? (
                      <button
                        onClick={() => setDeletingId(r.id)}
                        className="text-status-danger-fg dark:text-status-danger-fg hover:bg-status-danger-soft rounded p-1"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deletingId && deletingRow ? (
        <PsychDeleteDialog
          assessmentId={deletingId}
          targetName={deletingRow.targetName}
          onClose={(deleted) => {
            setDeletingId(null);
            if (deleted && onDeleted) onDeleted();
          }}
        />
      ) : null}
    </>
  );
}
