"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
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

// ─── Types ───────────────────────────────────────────────────

interface ExamStats {
  activeExams: number;
  totalExams: number;
  evaluatedGuards: number;
  totalGuards: number;
  pendingCount: number;
  avgScore: number;
  completedCount: number;
  lowPerformers: number;
  lowestGuardName: string | null;
  lowestAvg: number;
}

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

interface GuardRow {
  guardId: string;
  firstName: string;
  lastName: string;
  shiftLabel: string;
  puestoName: string | null;
  avgScore: number | null;
  completed: number;
  totalExams: number;
  pending: number;
  lastCompletedAt: string | null;
  trend: "up" | "stable" | "down";
}

interface GuardHistory {
  guard: {
    id: string;
    firstName: string;
    lastName: string;
    shiftLabel: string;
  };
  stats: {
    avgScore: number | null;
    bestScore: number | null;
    completedCount: number;
    totalAssigned: number;
    trend: "up" | "stable" | "down";
  };
  history: Array<{
    assignmentId: string;
    examId: string;
    examTitle: string;
    examType: string;
    status: string;
    sentAt: string;
    openedAt: string | null;
    completedAt: string | null;
    score: number | null;
    timeTakenSeconds: number | null;
    attemptNumber: number;
  }>;
}

interface ExamQuestion {
  id: string;
  questionText: string;
  questionType: string;
  options: string[] | null;
  correctAnswer: string | null;
  sectionReference: string | null;
  source: string;
  order: number;
}

interface ExamDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduleType: string;
  recurringMonths: number | null;
  questions: ExamQuestion[];
  _count: { assignments: number };
  installation: { id: string; name: string };
}

interface ExamSubTabProps {
  installationId: string;
}

type FilterTab = "all" | "protocol" | "security" | "guards";
type ViewMode = "list" | "create" | "detail" | "guard-history";

// ─── Component ───────────────────────────────────────────────

export function ExamSubTab({ installationId }: ExamSubTabProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Stats
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Exams
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  // Guards
  const [guards, setGuards] = useState<GuardRow[]>([]);
  const [guardsLoading, setGuardsLoading] = useState(false);

  // Guard history
  const [guardHistory, setGuardHistory] = useState<GuardHistory | null>(null);
  const [guardHistoryLoading, setGuardHistoryLoading] = useState(false);

  // Create exam
  const [createStep, setCreateStep] = useState<"type" | "questions" | "schedule">("type");
  const [newExamType, setNewExamType] = useState<"protocol" | "security_general">("protocol");
  const [newExamTitle, setNewExamTitle] = useState("");
  const [createdExamId, setCreatedExamId] = useState<string | null>(null);

  // Detail
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examDetail, setExamDetail] = useState<ExamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState("10");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Question editing
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", "", "", ""],
    correctAnswer: "",
  });
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", "", "", ""],
    correctAnswer: "",
  });

  // Schedule
  const [scheduleType, setScheduleType] = useState<"manual" | "on_assignment" | "recurring">("manual");
  const [recurringMonths, setRecurringMonths] = useState("3");

  // Assign
  const [assignLoading, setAssignLoading] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await fetch(`/api/ops/exams/stats?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  }, [installationId]);

  const fetchExams = useCallback(async () => {
    try {
      setExamsLoading(true);
      const res = await fetch(`/api/ops/exams?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) setExams(json.data);
    } catch {
      toast.error("Error al cargar exámenes");
    } finally {
      setExamsLoading(false);
    }
  }, [installationId]);

  const fetchGuards = useCallback(async () => {
    try {
      setGuardsLoading(true);
      const res = await fetch(`/api/ops/exams/guards?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) setGuards(json.data);
    } catch {
      toast.error("Error al cargar guardias");
    } finally {
      setGuardsLoading(false);
    }
  }, [installationId]);

  const fetchGuardHistory = useCallback(async (guardId: string) => {
    try {
      setGuardHistoryLoading(true);
      const res = await fetch(
        `/api/ops/exams/guards/${guardId}?installationId=${installationId}`,
      );
      const json = await res.json();
      if (json.success) setGuardHistory(json.data);
    } catch {
      toast.error("Error al cargar historial");
    } finally {
      setGuardHistoryLoading(false);
    }
  }, [installationId]);

  const fetchExamDetail = useCallback(async (examId: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/ops/exams/${examId}`);
      const json = await res.json();
      if (json.success) setExamDetail(json.data);
    } catch {
      toast.error("Error al cargar examen");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const checkAiConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config/ai-providers");
      const json = await res.json();
      if (json.success) {
        const hasDefault = json.data.some(
          (p: { isActive: boolean; models: { isDefault: boolean }[] }) =>
            p.isActive && p.models.some((m: { isDefault: boolean }) => m.isDefault),
        );
        setAiConfigured(hasDefault);
      }
    } catch {
      setAiConfigured(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchExams();
    checkAiConfig();
  }, [fetchStats, fetchExams, checkAiConfig]);

  useEffect(() => {
    if (filterTab === "guards") fetchGuards();
  }, [filterTab, fetchGuards]);

  // Filtered exams
  const filteredExams = exams.filter((e) => {
    if (filterTab === "protocol") return e.type === "protocol";
    if (filterTab === "security") return e.type === "security_general";
    return true;
  });

  // ─── Exam CRUD ──────────────────────────────────────────────

  const createExam = async () => {
    if (!newExamTitle.trim()) {
      toast.error("Ingresa un título para el examen");
      return;
    }
    try {
      const res = await fetch("/api/ops/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          title: newExamTitle,
          type: newExamType,
          scheduleType: "manual",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCreatedExamId(json.data.id);
        setCreateStep("questions");
        toast.success("Examen creado — agrega preguntas");
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
        fetchStats();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar examen");
    }
  };

  const toggleExamStatus = async (examId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/ops/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        if (examDetail && examDetail.id === examId) {
          setExamDetail({ ...examDetail, status: newStatus });
        }
        fetchExams();
        fetchStats();
        toast.success(`Estado cambiado a ${newStatus === "active" ? "Activo" : newStatus === "draft" ? "Borrador" : "Archivado"}`);
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  // ─── AI Questions ───────────────────────────────────────────

  const generateAiQuestions = async (examId: string) => {
    setAiLoading(true);
    try {
      const body: Record<string, unknown> = {
        questionCount: parseInt(aiCount) || 10,
      };
      if (newExamType === "security_general" || examDetail?.type === "security_general") {
        if (!aiTopic.trim()) {
          toast.error("Ingresa un tema para generar preguntas");
          setAiLoading(false);
          return;
        }
        body.topic = aiTopic;
      }
      const res = await fetch(`/api/ops/exams/${examId}/ai-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (examDetail) {
          setExamDetail({
            ...examDetail,
            questions: [...examDetail.questions, ...json.data],
          });
        }
        toast.success(`${json.data.length} preguntas generadas con IA`);
        // Refresh if in create flow
        if (createdExamId === examId) {
          await fetchExamDetail(examId);
        }
      } else {
        toast.error(json.error || "Error al generar preguntas");
      }
    } catch {
      toast.error("Error al generar preguntas con IA");
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Question CRUD ──────────────────────────────────────────

  const saveQuestion = async (examId: string, questionId: string) => {
    try {
      const body: Record<string, unknown> = {
        questionText: editForm.questionText,
        questionType: editForm.questionType,
        correctAnswer: editForm.correctAnswer,
      };
      if (editForm.questionType === "multiple_choice") {
        body.options = editForm.options.filter((o) => o.trim());
      } else {
        body.options = ["Verdadero", "Falso"];
      }
      const res = await fetch(`/api/ops/exams/${examId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (examDetail) {
          setExamDetail({
            ...examDetail,
            questions: examDetail.questions.map((q) =>
              q.id === questionId ? json.data : q,
            ),
          });
        }
        setEditingQuestion(null);
        toast.success("Pregunta actualizada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al actualizar pregunta");
    }
  };

  const deleteQuestion = async (examId: string, questionId: string) => {
    try {
      const res = await fetch(`/api/ops/exams/${examId}/questions/${questionId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        if (examDetail) {
          setExamDetail({
            ...examDetail,
            questions: examDetail.questions.filter((q) => q.id !== questionId),
          });
        }
        toast.success("Pregunta eliminada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar pregunta");
    }
  };

  const addQuestion = async (examId: string) => {
    if (!newQuestion.questionText.trim()) return;
    try {
      const body: Record<string, unknown> = {
        questionText: newQuestion.questionText,
        questionType: newQuestion.questionType,
        correctAnswer: newQuestion.correctAnswer,
        order: examDetail?.questions.length ?? 0,
      };
      if (newQuestion.questionType === "multiple_choice") {
        body.options = newQuestion.options.filter((o) => o.trim());
      } else {
        body.options = ["Verdadero", "Falso"];
      }
      const res = await fetch(`/api/ops/exams/${examId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (examDetail) {
          setExamDetail({
            ...examDetail,
            questions: [...examDetail.questions, json.data],
          });
        }
        setNewQuestion({
          questionText: "",
          questionType: "multiple_choice",
          options: ["", "", "", ""],
          correctAnswer: "",
        });
        setShowAddQuestion(false);
        toast.success("Pregunta creada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear pregunta");
    }
  };

  // ─── Schedule & Finalize ────────────────────────────────────

  const finalizeExam = async (examId: string, activate: boolean) => {
    try {
      const body: Record<string, unknown> = {
        scheduleType,
      };
      if (scheduleType === "recurring") {
        body.recurringMonths = parseInt(recurringMonths);
      }
      if (activate) {
        body.status = "active";
      }
      const res = await fetch(`/api/ops/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        if (activate) {
          // Send to all guards
          await sendToGuards(examId);
          toast.success("Examen activado y enviado a guardias");
        } else {
          toast.success("Examen guardado como borrador");
        }
        setViewMode("list");
        resetCreate();
        fetchExams();
        fetchStats();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al finalizar examen");
    }
  };

  const sendToGuards = async (examId: string) => {
    setAssignLoading(true);
    try {
      // Get guards for this installation
      const guardsRes = await fetch(`/api/ops/exams/guards?installationId=${installationId}`);
      const guardsJson = await guardsRes.json();
      if (!guardsJson.success || guardsJson.data.length === 0) return;

      const guardIds = guardsJson.data.map((g: GuardRow) => g.guardId);
      await fetch(`/api/ops/exams/${examId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardIds }),
      });
    } catch {
      // silent - already toasted
    } finally {
      setAssignLoading(false);
    }
  };

  const resetCreate = () => {
    setCreateStep("type");
    setNewExamType("protocol");
    setNewExamTitle("");
    setCreatedExamId(null);
    setExamDetail(null);
    setScheduleType("manual");
    setRecurringMonths("3");
    setAiTopic("");
    setAiCount("10");
    setShowAddQuestion(false);
    setEditingQuestion(null);
  };

  // ─── Navigation helpers ─────────────────────────────────────

  const openDetail = (examId: string) => {
    setSelectedExamId(examId);
    setViewMode("detail");
    fetchExamDetail(examId);
  };

  const openGuardHistory = (guardId: string) => {
    setViewMode("guard-history");
    fetchGuardHistory(guardId);
  };

  const goBackToList = () => {
    setViewMode("list");
    setSelectedExamId(null);
    setExamDetail(null);
    setGuardHistory(null);
    resetCreate();
    fetchExams();
    fetchStats();
  };

  // ─── Render: Guard History ──────────────────────────────────

  if (viewMode === "guard-history") {
    if (guardHistoryLoading || !guardHistory) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando historial...</span>
        </div>
      );
    }

    const { guard, stats: gStats, history } = guardHistory;
    const initials = `${guard.firstName[0] ?? ""}${guard.lastName[0] ?? ""}`.toUpperCase();
    const scoreColor = (gStats.avgScore ?? 0) >= 80
      ? "bg-green-500"
      : (gStats.avgScore ?? 0) >= 60
        ? "bg-yellow-500"
        : "bg-red-500";

    return (
      <div className="space-y-4">
        {/* Back button */}
        <button
          onClick={goBackToList}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Volver a exámenes
        </button>

        {/* Guard header */}
        <div className="flex items-center gap-3 border rounded-lg p-3 bg-muted/30">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold", scoreColor)}>
            {initials}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {guard.firstName} {guard.lastName}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {guard.shiftLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{gStats.totalAssigned} exámenes asignados</p>
          </div>
        </div>

        {/* Guard stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatMini label="Promedio" value={gStats.avgScore != null ? `${gStats.avgScore}%` : "—"} />
          <StatMini
            label="Rendidos"
            value={`${gStats.completedCount}/${gStats.totalAssigned}`}
          />
          <StatMini
            label="Tendencia"
            value={gStats.trend === "up" ? "Mejorando" : gStats.trend === "down" ? "Bajando" : "Estable"}
            icon={gStats.trend === "up" ? <TrendingUp className="h-3 w-3 text-green-500" /> : gStats.trend === "down" ? <TrendingDown className="h-3 w-3 text-red-500" /> : null}
          />
          <StatMini label="Mejor nota" value={gStats.bestScore != null ? `${gStats.bestScore}%` : "—"} />
        </div>

        {/* History list */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Historial cronológico</h4>
          {history.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">Sin exámenes registrados.</p>
          ) : (
            history.map((h) => (
              <div key={h.assignmentId} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{h.examTitle}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      h.examType === "protocol" ? "text-blue-600 border-blue-300" : "text-purple-600 border-purple-300",
                    )}
                  >
                    {h.examType === "protocol" ? "Protocolo" : "Seguridad"}
                  </Badge>
                  {h.attemptNumber > 1 && (
                    <Badge variant="secondary" className="text-[10px]">
                      Intento {h.attemptNumber}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Enviado: {new Date(h.sentAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                  </span>
                  {h.openedAt && (
                    <span>
                      Abierto: {new Date(h.openedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  {h.timeTakenSeconds != null && (
                    <span>Tiempo: {Math.round(h.timeTakenSeconds / 60)} min</span>
                  )}
                  {h.score != null && (
                    <span className="flex items-center gap-1">
                      <span className={cn(
                        "font-semibold",
                        h.score >= 80 ? "text-green-600" : h.score >= 60 ? "text-yellow-600" : "text-red-600",
                      )}>
                        {Math.round(h.score)}%
                      </span>
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            h.score >= 80 ? "bg-green-500" : h.score >= 60 ? "bg-yellow-500" : "bg-red-500",
                          )}
                          style={{ width: `${h.score}%` }}
                        />
                      </div>
                    </span>
                  )}
                  {h.status !== "completed" && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        h.status === "expired" ? "bg-red-100 text-red-700" : "",
                      )}
                    >
                      {h.status === "sent" ? "Enviado" : h.status === "opened" ? "Abierto" : "Expirado"}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ─── Render: Create Exam ────────────────────────────────────

  if (viewMode === "create") {
    return (
      <div className="space-y-4">
        <button
          onClick={goBackToList}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Volver a exámenes
        </button>

        {/* Step: Type selection */}
        {createStep === "type" && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Nuevo Examen</h3>
            <Input
              placeholder="Título del examen"
              value={newExamTitle}
              onChange={(e) => setNewExamTitle(e.target.value)}
              className="text-sm"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Selecciona el tipo:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                className={cn(
                  "border rounded-lg p-4 text-left transition-all hover:border-primary/50",
                  newExamType === "protocol"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "hover:bg-muted/50",
                )}
                onClick={() => setNewExamType("protocol")}
              >
                <BookOpen className="h-6 w-6 text-blue-500 mb-2" />
                <span className="text-sm font-medium block">Protocolo</span>
                <span className="text-xs text-muted-foreground">
                  Preguntas del protocolo de esta instalación
                </span>
              </button>
              <button
                className={cn(
                  "border rounded-lg p-4 text-left transition-all hover:border-primary/50",
                  newExamType === "security_general"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "hover:bg-muted/50",
                )}
                onClick={() => setNewExamType("security_general")}
              >
                <Shield className="h-6 w-6 text-purple-500 mb-2" />
                <span className="text-sm font-medium block">Seguridad General</span>
                <span className="text-xs text-muted-foreground">
                  Primeros auxilios, prevención, procedimientos
                </span>
              </button>
            </div>
            <Button onClick={createExam} disabled={!newExamTitle.trim()}>
              Continuar
            </Button>
          </div>
        )}

        {/* Step: Questions */}
        {createStep === "questions" && createdExamId && (
          <CreateQuestionsStep
            examId={createdExamId}
            examType={newExamType}
            examDetail={examDetail}
            fetchExamDetail={fetchExamDetail}
            aiConfigured={aiConfigured}
            aiLoading={aiLoading}
            aiTopic={aiTopic}
            setAiTopic={setAiTopic}
            aiCount={aiCount}
            setAiCount={setAiCount}
            generateAiQuestions={generateAiQuestions}
            editingQuestion={editingQuestion}
            setEditingQuestion={setEditingQuestion}
            editForm={editForm}
            setEditForm={setEditForm}
            saveQuestion={saveQuestion}
            deleteQuestion={deleteQuestion}
            showAddQuestion={showAddQuestion}
            setShowAddQuestion={setShowAddQuestion}
            newQuestion={newQuestion}
            setNewQuestion={setNewQuestion}
            addQuestion={addQuestion}
            onNext={() => setCreateStep("schedule")}
          />
        )}

        {/* Step: Schedule */}
        {createStep === "schedule" && createdExamId && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Programación de envío</h3>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { value: "manual", label: "Enviar ahora", desc: "A todos los guardias asignados", icon: "📤" },
                  { value: "on_assignment", label: "Al asignar guardia", desc: "Automático cuando ingresa nuevo guardia", icon: "👤" },
                  { value: "recurring", label: "Recurrente", desc: "Cada X meses a guardias activos", icon: "🔄" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  className={cn(
                    "border rounded-lg p-3 text-left transition-all",
                    scheduleType === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => setScheduleType(opt.value)}
                >
                  <span className="text-lg block mb-1">{opt.icon}</span>
                  <span className="text-xs font-medium block">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                </button>
              ))}
            </div>

            {scheduleType === "recurring" && (
              <div className="flex items-center gap-2">
                <span className="text-xs">Cada</span>
                <Select value={recurringMonths} onValueChange={setRecurringMonths}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} {n === 1 ? "mes" : "meses"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => finalizeExam(createdExamId, false)}>
                Guardar borrador
              </Button>
              <Button onClick={() => finalizeExam(createdExamId, true)} disabled={assignLoading}>
                {assignLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                Crear y enviar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Render: Exam Detail ────────────────────────────────────

  if (viewMode === "detail") {
    if (detailLoading || !examDetail) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando examen...</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <button
          onClick={goBackToList}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Volver a exámenes
        </button>

        {/* Exam header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{examDetail.title}</h3>
            <p className="text-xs text-muted-foreground">
              {examDetail.questions.length} preguntas · {examDetail._count.assignments} asignaciones
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant={examDetail.status === "active" ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={() =>
                toggleExamStatus(
                  examDetail.id,
                  examDetail.status === "active" ? "draft" : "active",
                )
              }
            >
              {examDetail.status === "active"
                ? "Activo"
                : examDetail.status === "draft"
                  ? "Borrador"
                  : "Archivado"}
            </Badge>
            {examDetail.status === "active" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => sendToGuards(examDetail.id)}
                disabled={assignLoading}
              >
                {assignLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                Enviar a guardias
              </Button>
            )}
          </div>
        </div>

        {/* AI generate */}
        <AiGeneratePanel
          examType={examDetail.type}
          aiConfigured={aiConfigured}
          aiLoading={aiLoading}
          aiTopic={aiTopic}
          setAiTopic={setAiTopic}
          aiCount={aiCount}
          setAiCount={setAiCount}
          onGenerate={() => generateAiQuestions(examDetail.id)}
        />

        {/* Questions */}
        <QuestionsList
          examId={examDetail.id}
          questions={examDetail.questions}
          editingQuestion={editingQuestion}
          setEditingQuestion={setEditingQuestion}
          editForm={editForm}
          setEditForm={setEditForm}
          saveQuestion={saveQuestion}
          deleteQuestion={deleteQuestion}
        />

        {/* Add question */}
        {showAddQuestion ? (
          <div className="border rounded-lg overflow-hidden">
            <QuestionForm
              form={newQuestion}
              setForm={setNewQuestion}
              onSave={() => addQuestion(examDetail.id)}
              onCancel={() => setShowAddQuestion(false)}
              saveLabel="Crear pregunta"
            />
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowAddQuestion(true)}>
            <Plus className="h-4 w-4 mr-1" /> Agregar pregunta
          </Button>
        )}
      </div>
    );
  }

  // ─── Render: Main List View ─────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            icon={<BookOpen className="h-4 w-4 text-blue-500" />}
            label="Exámenes activos"
            value={stats.activeExams}
            sub={`${stats.totalExams} total`}
          />
          <StatCard
            icon={<Users className="h-4 w-4 text-emerald-500" />}
            label="Guardias evaluados"
            value={`${stats.evaluatedGuards} de ${stats.totalGuards}`}
            sub={stats.pendingCount > 0 ? `${stats.pendingCount} pendientes` : undefined}
          />
          <StatCard
            icon={<BarChart3 className="h-4 w-4 text-violet-500" />}
            label="Score promedio"
            value={stats.completedCount > 0 ? `${stats.avgScore}%` : "—"}
            sub={stats.completedCount > 0 ? `${stats.completedCount} completados` : "Sin datos"}
            valueColor={
              stats.avgScore >= 80
                ? "text-green-600"
                : stats.avgScore >= 60
                  ? "text-yellow-600"
                  : stats.avgScore > 0
                    ? "text-red-600"
                    : undefined
            }
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            label="Bajo rendimiento"
            value={stats.lowPerformers}
            sub={stats.lowestGuardName ? `Menor: ${stats.lowestGuardName}` : undefined}
          />
        </div>
      ) : null}

      {/* Header + New button */}
      <div className="flex items-center justify-between">
        {/* Filter tabs */}
        <div className="flex border rounded-lg overflow-hidden">
          {(
            [
              { id: "all", label: "Todos" },
              { id: "protocol", label: "📋 Protocolo" },
              { id: "security", label: "🛡️ Seguridad" },
              { id: "guards", label: "👮 Por Guardia" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                filterTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button size="sm" onClick={() => setViewMode("create")}>
          <Plus className="h-3 w-3 mr-1" /> Nuevo examen
        </Button>
      </div>

      {/* Content based on filter */}
      {filterTab === "guards" ? (
        /* Guards view */
        guardsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : guards.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No hay guardias asignados a esta instalación.
          </div>
        ) : (
          <div className="space-y-2">
            {guards.map((g) => {
              const initials = `${g.firstName[0] ?? ""}${g.lastName[0] ?? ""}`.toUpperCase();
              const scoreColor = g.avgScore != null
                ? g.avgScore >= 80
                  ? "bg-green-500"
                  : g.avgScore >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
                : "bg-gray-400";

              return (
                <button
                  key={g.guardId}
                  className="w-full border rounded-lg p-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => openGuardHistory(g.guardId)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold", scoreColor)}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {g.firstName} {g.lastName}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {g.shiftLabel}
                        </Badge>
                        {g.pending > 0 && (
                          <Badge className="text-[10px] bg-red-500 hover:bg-red-600 shrink-0">
                            {g.pending} pendiente{g.pending > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {g.lastCompletedAt && (
                          <span>
                            Último:{" "}
                            {new Date(g.lastCompletedAt).toLocaleDateString("es-CL", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        )}
                        <span>
                          Completados: {g.completed}/{g.totalExams}
                        </span>
                        {g.avgScore != null && (
                          <span className="flex items-center gap-1">
                            <span className={cn(
                              "font-medium",
                              g.avgScore >= 80 ? "text-green-600" : g.avgScore >= 60 ? "text-yellow-600" : "text-red-600",
                            )}>
                              {g.avgScore}%
                            </span>
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  g.avgScore >= 80 ? "bg-green-500" : g.avgScore >= 60 ? "bg-yellow-500" : "bg-red-500",
                                )}
                                style={{ width: `${g.avgScore}%` }}
                              />
                            </div>
                          </span>
                        )}
                        <span>
                          {g.trend === "up" && "📈"}
                          {g.trend === "stable" && "➡️"}
                          {g.trend === "down" && "📉"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        /* Exam list */
        examsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {filterTab === "all"
              ? "No hay exámenes creados. Crea el primero."
              : `No hay exámenes de tipo ${filterTab === "protocol" ? "Protocolo" : "Seguridad General"}.`}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredExams.map((exam) => {
              const completedAssignments = exam._count.assignments; // total assigned
              return (
                <div key={exam.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {exam.type === "protocol" ? (
                          <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />
                        ) : (
                          <Shield className="h-4 w-4 text-purple-500 shrink-0" />
                        )}
                        <button
                          onClick={() => openDetail(exam.id)}
                          className="text-sm font-medium hover:underline text-left truncate"
                        >
                          {exam.title}
                        </button>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] shrink-0",
                            exam.type === "protocol"
                              ? "text-blue-600 border-blue-300"
                              : "text-purple-600 border-purple-300",
                          )}
                        >
                          {exam.type === "protocol" ? "Protocolo" : "Seguridad"}
                        </Badge>
                        <Badge
                          variant={exam.status === "active" ? "default" : "secondary"}
                          className={cn(
                            "text-[10px] shrink-0",
                            exam.status === "active" ? "bg-green-600 hover:bg-green-700" : "",
                          )}
                        >
                          {exam.status === "active"
                            ? "Activo"
                            : exam.status === "draft"
                              ? "Borrador"
                              : "Archivado"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{exam._count.questions} preguntas</span>
                        <span>{completedAssignments} asignaciones</span>
                        <span>
                          {new Date(exam.createdAt).toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openDetail(exam.id)}
                      >
                        Ver detalle
                      </Button>
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
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={cn("text-lg font-bold", valueColor)}>{value}</div>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StatMini({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border rounded p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        {icon}
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  );
}

function AiGeneratePanel({
  examType,
  aiConfigured,
  aiLoading,
  aiTopic,
  setAiTopic,
  aiCount,
  setAiCount,
  onGenerate,
}: {
  examType: string;
  aiConfigured: boolean | null;
  aiLoading: boolean;
  aiTopic: string;
  setAiTopic: (v: string) => void;
  aiCount: string;
  setAiCount: (v: string) => void;
  onGenerate: () => void;
}) {
  if (aiConfigured === false) {
    return (
      <div className="rounded-lg border bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 p-3 flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
        <span className="text-xs text-yellow-800 dark:text-yellow-200">
          IA no configurada — no se pueden generar preguntas automáticamente.
        </span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Generar preguntas con IA
      </div>
      {aiLoading ? (
        <div className="flex items-center justify-center py-4 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Generando preguntas con IA…</span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          {examType === "security_general" && (
            <Input
              placeholder="Tema (ej: primeros auxilios, extintores...)"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              className="text-sm flex-1"
            />
          )}
          <Select value={aiCount} onValueChange={setAiCount}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} preguntas
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={onGenerate}>
            <Sparkles className="h-3 w-3 mr-1" /> Generar
          </Button>
        </div>
      )}
    </div>
  );
}

function CreateQuestionsStep({
  examId,
  examType,
  examDetail,
  fetchExamDetail,
  aiConfigured,
  aiLoading,
  aiTopic,
  setAiTopic,
  aiCount,
  setAiCount,
  generateAiQuestions,
  editingQuestion,
  setEditingQuestion,
  editForm,
  setEditForm,
  saveQuestion,
  deleteQuestion,
  showAddQuestion,
  setShowAddQuestion,
  newQuestion,
  setNewQuestion,
  addQuestion,
  onNext,
}: {
  examId: string;
  examType: string;
  examDetail: ExamDetail | null;
  fetchExamDetail: (id: string) => Promise<void>;
  aiConfigured: boolean | null;
  aiLoading: boolean;
  aiTopic: string;
  setAiTopic: (v: string) => void;
  aiCount: string;
  setAiCount: (v: string) => void;
  generateAiQuestions: (examId: string) => Promise<void>;
  editingQuestion: string | null;
  setEditingQuestion: (id: string | null) => void;
  editForm: { questionText: string; questionType: string; options: string[]; correctAnswer: string };
  setEditForm: (f: { questionText: string; questionType: string; options: string[]; correctAnswer: string }) => void;
  saveQuestion: (examId: string, questionId: string) => Promise<void>;
  deleteQuestion: (examId: string, questionId: string) => Promise<void>;
  showAddQuestion: boolean;
  setShowAddQuestion: (v: boolean) => void;
  newQuestion: { questionText: string; questionType: string; options: string[]; correctAnswer: string };
  setNewQuestion: (f: { questionText: string; questionType: string; options: string[]; correctAnswer: string }) => void;
  addQuestion: (examId: string) => Promise<void>;
  onNext: () => void;
}) {
  useEffect(() => {
    fetchExamDetail(examId);
  }, [examId, fetchExamDetail]);

  if (!examDetail) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Cargando examen…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">
        Preguntas — {examDetail.title}
        <Badge variant="secondary" className="ml-2 text-[10px]">
          {examDetail.questions.length} preguntas
        </Badge>
      </h3>

      {/* AI generate */}
      <AiGeneratePanel
        examType={examType}
        aiConfigured={aiConfigured}
        aiLoading={aiLoading}
        aiTopic={aiTopic}
        setAiTopic={setAiTopic}
        aiCount={aiCount}
        setAiCount={setAiCount}
        onGenerate={() => generateAiQuestions(examId)}
      />

      {/* Questions */}
      <QuestionsList
        examId={examId}
        questions={examDetail.questions}
        editingQuestion={editingQuestion}
        setEditingQuestion={setEditingQuestion}
        editForm={editForm}
        setEditForm={setEditForm}
        saveQuestion={saveQuestion}
        deleteQuestion={deleteQuestion}
      />

      {/* Add question */}
      {showAddQuestion ? (
        <div className="border rounded-lg overflow-hidden">
          <QuestionForm
            form={newQuestion}
            setForm={setNewQuestion}
            onSave={() => addQuestion(examId)}
            onCancel={() => setShowAddQuestion(false)}
            saveLabel="Crear pregunta"
          />
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowAddQuestion(true)}>
          <Plus className="h-4 w-4 mr-1" /> Agregar pregunta manual
        </Button>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={examDetail.questions.length === 0}>
          Siguiente: Programación
        </Button>
      </div>
    </div>
  );
}

function QuestionsList({
  examId,
  questions,
  editingQuestion,
  setEditingQuestion,
  editForm,
  setEditForm,
  saveQuestion,
  deleteQuestion,
}: {
  examId: string;
  questions: ExamQuestion[];
  editingQuestion: string | null;
  setEditingQuestion: (id: string | null) => void;
  editForm: { questionText: string; questionType: string; options: string[]; correctAnswer: string };
  setEditForm: (f: { questionText: string; questionType: string; options: string[]; correctAnswer: string }) => void;
  saveQuestion: (examId: string, questionId: string) => Promise<void>;
  deleteQuestion: (examId: string, questionId: string) => Promise<void>;
}) {
  if (questions.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No hay preguntas aún. Genera con IA o agrega manualmente.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {questions.map((q, idx) => (
        <div key={q.id} className="border rounded-lg overflow-hidden">
          {editingQuestion === q.id ? (
            <QuestionForm
              form={editForm}
              setForm={setEditForm}
              onSave={() => saveQuestion(examId, q.id)}
              onCancel={() => setEditingQuestion(null)}
              saveLabel="Guardar"
            />
          ) : (
            <div className="px-3 py-2.5 group">
              <div className="flex items-start gap-2">
                <span className="text-xs font-medium text-muted-foreground mt-0.5 shrink-0 w-6">
                  {idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{q.questionText}</p>
                  {q.options && Array.isArray(q.options) && (
                    <div className="mt-1.5 space-y-0.5">
                      {(q.options as string[]).map((opt, i) => (
                        <div
                          key={i}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded",
                            String(i) === q.correctAnswer || opt.toLowerCase() === q.correctAnswer
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {String.fromCharCode(65 + i)}) {opt}
                          {(String(i) === q.correctAnswer || opt.toLowerCase() === q.correctAnswer) && (
                            <Check className="h-3 w-3 inline ml-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    {q.sectionReference && (
                      <Badge variant="outline" className="text-[10px]">
                        {q.sectionReference}
                      </Badge>
                    )}
                    {q.source !== "manual" && (
                      <Badge variant="outline" className="text-[10px]">
                        IA
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingQuestion(q.id);
                      setEditForm({
                        questionText: q.questionText,
                        questionType: q.questionType,
                        options: Array.isArray(q.options)
                          ? [...(q.options as string[]), "", "", "", ""].slice(0, 4)
                          : ["", "", "", ""],
                        correctAnswer: q.correctAnswer ?? "",
                      });
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => deleteQuestion(examId, q.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface QuestionFormData {
  questionText: string;
  questionType: string;
  options: string[];
  correctAnswer: string;
}

function QuestionForm({
  form,
  setForm,
  onSave,
  onCancel,
  saveLabel,
}: {
  form: QuestionFormData;
  setForm: (f: QuestionFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="p-3 space-y-3 bg-muted/20">
      <textarea
        value={form.questionText}
        onChange={(e) => setForm({ ...form, questionText: e.target.value })}
        placeholder="Texto de la pregunta"
        className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] resize-y bg-background"
        autoFocus
      />

      <Select
        value={form.questionType}
        onValueChange={(v) => setForm({ ...form, questionType: v, correctAnswer: "" })}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="multiple_choice">Selección múltiple</SelectItem>
          <SelectItem value="true_false">Verdadero / Falso</SelectItem>
        </SelectContent>
      </Select>

      {form.questionType === "multiple_choice" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Opciones</label>
          {form.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground w-5">
                {String.fromCharCode(65 + i)})
              </span>
              <Input
                value={opt}
                onChange={(e) => {
                  const next = [...form.options];
                  next[i] = e.target.value;
                  setForm({ ...form, options: next });
                }}
                placeholder={`Opción ${String.fromCharCode(65 + i)}`}
                className="text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, correctAnswer: String(i) })}
                className={cn(
                  "h-6 w-6 rounded-full border flex items-center justify-center shrink-0",
                  form.correctAnswer === String(i)
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-muted-foreground/30 hover:border-green-400",
                )}
              >
                {form.correctAnswer === String(i) && <Check className="h-3 w-3" />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Respuesta correcta</label>
          <div className="flex gap-3">
            {["true", "false"].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setForm({ ...form, correctAnswer: val })}
                className={cn(
                  "px-3 py-1.5 rounded border text-sm",
                  form.correctAnswer === val
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "border-muted-foreground/30 hover:border-green-400",
                )}
              >
                {val === "true" ? "Verdadero" : "Falso"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave}>
          <Save className="h-3 w-3 mr-1" /> {saveLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
