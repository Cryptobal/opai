"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, ListOrdered, Trash2 } from "lucide-react";
import PsychBandBadge from "./PsychBandBadge";
import PsychResponsesModal from "./PsychResponsesModal";
import PsychDeleteDialog from "./PsychDeleteDialog";

export interface HistoryAssessment {
  id: string;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  targetName: string;
  result: { globalScore: number; band: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Enviado",
  STARTED: "En progreso",
  SUBMITTED: "Finalizado",
  SCORED: "Resultado",
  REVIEWED: "Revisado",
  EXPIRED: "Expirado",
};

interface Props {
  rows: HistoryAssessment[];
  canDelete: boolean;
  onDeleted?: () => void;
}

export default function PsychHistoryTable({
  rows,
  canDelete,
  onDeleted,
}: Props) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Sin evaluaciones previas.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div
              key={r.id}
              className="p-3 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground">
                    {new Date(r.submittedAt ?? r.createdAt).toLocaleDateString(
                      "es-CL",
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.result ? (
                    <span className="text-sm font-medium text-foreground">
                      · {r.result.globalScore.toFixed(1)}
                    </span>
                  ) : null}
                  <PsychBandBadge band={r.result?.band ?? null} />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/personas/psicolaboral/${r.id}`}
                  className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1.5 text-foreground/90 hover:bg-accent min-h-[36px]"
                >
                  <Eye className="size-3.5" /> Detalle
                </Link>
                {r.status === "SCORED" || r.status === "REVIEWED" ? (
                  <button
                    onClick={() => setViewingId(r.id)}
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1.5 text-foreground/90 hover:bg-accent min-h-[36px]"
                  >
                    <ListOrdered className="size-3.5" /> Respuestas
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    onClick={() => setDeletingId(r.id)}
                    className="inline-flex items-center gap-1 text-xs rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-red-700 dark:text-red-400 hover:bg-red-500/10 min-h-[36px]"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {viewingId ? (
        <PsychResponsesModal
          assessmentId={viewingId}
          onClose={() => setViewingId(null)}
        />
      ) : null}
      {deletingId ? (
        <PsychDeleteDialog
          assessmentId={deletingId}
          targetName={rows.find((r) => r.id === deletingId)?.targetName ?? ""}
          onClose={(deleted) => {
            setDeletingId(null);
            if (deleted && onDeleted) onDeleted();
          }}
        />
      ) : null}
    </>
  );
}
