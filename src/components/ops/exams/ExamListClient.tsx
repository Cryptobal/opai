"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Clock,
  Loader2,
  Plus,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ExamEditorClient } from "./ExamEditorClient";
import { ExamAssignClient } from "./ExamAssignClient";

// ─── Types ───────────────────────────────────────────────────

interface ExamSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduleType: string;
  createdAt: string;
  _count: { questions: number; assignments: number };
  installation: { id: string; name: string };
}

interface ExamListProps {
  installationId: string;
}

type ViewMode = "list" | "editor" | "assign";

// ─── Component ───────────────────────────────────────────────

export function ExamListClient({ installationId }: ExamListProps) {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("protocol");

  const fetchExams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/exams?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) setExams(json.data);
    } catch {
      toast.error("Error al cargar exámenes");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const createExam = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/ops/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          title: newTitle,
          type: newType,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Examen creado");
        setNewTitle("");
        setShowCreate(false);
        setSelectedExamId(json.data.id);
        setViewMode("editor");
        fetchExams();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear examen");
    }
  };

  const deleteExam = async (examId: string) => {
    if (!confirm("¿Eliminar este examen y todas sus preguntas?")) return;
    try {
      const res = await fetch(`/api/ops/exams/${examId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setExams((prev) => prev.filter((e) => e.id !== examId));
        toast.success("Examen eliminado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar examen");
    }
  };

  // ─── Sub-views ─────────────────────────────────────────────

  if (viewMode === "editor" && selectedExamId) {
    return (
      <ExamEditorClient
        examId={selectedExamId}
        onBack={() => {
          setViewMode("list");
          setSelectedExamId(null);
          fetchExams();
        }}
      />
    );
  }

  if (viewMode === "assign" && selectedExamId) {
    return (
      <ExamAssignClient
        examId={selectedExamId}
        installationId={installationId}
        onBack={() => {
          setViewMode("list");
          setSelectedExamId(null);
          fetchExams();
        }}
      />
    );
  }

  // ─── List view ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: "Borrador",
    active: "Activo",
    archived: "Archivado",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Exámenes</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> Nuevo examen
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
          <Input
            placeholder="Título del examen"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="text-sm"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && createExam()}
          />
          <div className="flex gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="protocol">Protocolo de instalación</SelectItem>
                <SelectItem value="security_general">Seguridad general</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={createExam}>
              Crear
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Exam list */}
      {exams.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No hay exámenes creados para esta instalación.
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {exam.type === "protocol" ? (
                      <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <button
                      onClick={() => {
                        setSelectedExamId(exam.id);
                        setViewMode("editor");
                      }}
                      className="text-sm font-medium hover:underline text-left truncate"
                    >
                      {exam.title}
                    </button>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", STATUS_COLORS[exam.status] ?? "")}>
                      {STATUS_LABELS[exam.status] ?? exam.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{exam._count.questions} preguntas</span>
                    <span>{exam._count.assignments} asignaciones</span>
                    <span>{exam.type === "protocol" ? "Protocolo" : "Seguridad general"}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {exam.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setSelectedExamId(exam.id);
                        setViewMode("assign");
                      }}
                    >
                      <Users className="h-3 w-3 mr-1" /> Asignar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => deleteExam(exam.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
