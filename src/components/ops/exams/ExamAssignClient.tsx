"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Clock,
  Loader2,
  Send,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface Guard {
  id: string;
  code: string | null;
  persona: { firstName: string; lastName: string };
}

interface Assignment {
  id: string;
  guardId: string;
  status: string;
  sentAt: string;
  completedAt: string | null;
  score: number | null;
  attemptNumber: number;
  guard: {
    id: string;
    persona: { firstName: string; lastName: string };
  };
}

interface ExamAssignProps {
  examId: string;
  installationId: string;
  onBack: () => void;
}

// ─── Component ───────────────────────────────────────────────

export function ExamAssignClient({ examId, installationId, onBack }: ExamAssignProps) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGuards, setSelectedGuards] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch assignments and guards in parallel
      const [assignRes, guardsRes] = await Promise.all([
        fetch(`/api/ops/exams/${examId}/assign`),
        fetch(`/api/ops/protocols?installationId=${installationId}`).then(() =>
          // Fetch guards assigned to this installation
          fetch(`/api/ops/exams?installationId=${installationId}`),
        ),
      ]);

      const assignJson = await assignRes.json();
      if (assignJson.success) setAssignments(assignJson.data);

      // Fetch guards from the installation's current guards
      const guardsApiRes = await fetch(
        `/api/ops/protocols?installationId=${installationId}`,
      );
      // We need to get guards differently — let's use assignments data
      // Guards are already included in assignments; for unassigned we need to find them
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [examId, installationId]);

  // Simpler approach: just fetch assignments
  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/exams/${examId}/assign`);
      const json = await res.json();
      if (json.success) setAssignments(json.data);
    } catch {
      toast.error("Error al cargar asignaciones");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const assignExam = async (guardIds: string[]) => {
    if (guardIds.length === 0) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/ops/exams/${examId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardIds }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Examen enviado a ${guardIds.length} guardia(s)`);
        setSelectedGuards(new Set());
        fetchAssignments();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al asignar examen");
    } finally {
      setAssigning(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Check }> = {
    sent: { label: "Enviado", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Send },
    opened: { label: "Abierto", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
    completed: { label: "Completado", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: Check },
    expired: { label: "Expirado", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: X },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-1">
            ← Volver a exámenes
          </button>
          <h3 className="text-sm font-semibold">Asignaciones del examen</h3>
        </div>
      </div>

      {/* Assignments list */}
      {assignments.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No hay asignaciones aún. Asigna el examen a guardias desde la lista de guardias.
        </div>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const config = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.sent;
            const StatusIcon = config.icon;
            return (
              <div key={a.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {a.guard.persona.firstName} {a.guard.persona.lastName}
                    </span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1", config.color)}>
                      <StatusIcon className="h-2.5 w-2.5" />
                      {config.label}
                    </span>
                    {a.attemptNumber > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        Intento {a.attemptNumber}
                      </Badge>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {a.score !== null && (
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          Number(a.score) >= 70 ? "text-green-600" : "text-red-600",
                        )}
                      >
                        {Number(a.score).toFixed(0)}%
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.sentAt).toLocaleDateString("es-CL")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary stats */}
      {assignments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Enviados"
            value={assignments.length}
          />
          <StatCard
            label="Completados"
            value={assignments.filter((a) => a.status === "completed").length}
          />
          <StatCard
            label="Promedio"
            value={
              assignments.filter((a) => a.score !== null).length > 0
                ? `${(
                    assignments
                      .filter((a) => a.score !== null)
                      .reduce((sum, a) => sum + Number(a.score), 0) /
                    assignments.filter((a) => a.score !== null).length
                  ).toFixed(0)}%`
                : "—"
            }
          />
          <StatCard
            label="Aprobados (≥70%)"
            value={assignments.filter((a) => a.score !== null && Number(a.score) >= 70).length}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
