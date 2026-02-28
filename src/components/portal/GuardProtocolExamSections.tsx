"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Phone,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GuardSession, PortalSection } from "@/lib/guard-portal";

// ─── Types ───────────────────────────────────────────────────

interface ProtocolSection {
  id: string;
  title: string;
  icon: string | null;
  items: Array<{ id: string; title: string; description: string | null }>;
}

interface PendingExam {
  assignmentId: string;
  examId: string;
  examTitle: string;
  examType: string;
  questionCount: number;
  status: string;
  sentAt: string;
}

interface ExamQuestion {
  id: string;
  questionText: string;
  questionType: string;
  options: string[] | null;
  sectionReference: string | null;
  correctAnswer?: string;
}

interface ExamResult {
  assignmentId: string;
  examTitle: string;
  examType: string;
  status: string;
  score: number | null;
  completedAt: string | null;
  sentAt: string;
}

// ─── Protocol Section ─────────────────────────────────────────

export function ProtocoloSection({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const [sections, setSections] = useState<ProtocolSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [installationName, setInstallationName] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const fetchProtocol = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/portal/guardia/protocol?guardiaId=${session.guardiaId}`,
      );
      const json = await res.json();
      if (json.success) {
        setSections(json.data.sections);
        setInstallationName(json.data.installationName);
        setVersion(json.data.version);
        setPublishedAt(json.data.publishedAt);
        setExpanded(new Set(json.data.sections.map((s: ProtocolSection) => s.id)));
      }
    } catch {
      toast.error("Error al cargar protocolo");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchProtocol();
  }, [fetchProtocol]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando protocolo...</span>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No hay protocolo publicado para tu instalación.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-4 text-xs"
          onClick={() => onNavigate("inicio")}
        >
          <ArrowLeft className="h-3 w-3 mr-1" /> Volver al inicio
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate("inicio")}
          className="p-2 -ml-2 rounded-lg active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold">Protocolo de Instalación</h2>
          <p className="text-xs text-muted-foreground truncate">
            {installationName}
            {version && <span> · v{version}</span>}
            {publishedAt && (
              <span>
                {" "}· {new Date(publishedAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Sections accordion — read only */}
      <div className="space-y-2">
        {sections.map((section) => (
          <div key={section.id} className="border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-3 active:bg-muted/50 transition-colors text-left"
              onClick={() => toggleSection(section.id)}
            >
              {section.icon && <span className="text-base">{section.icon}</span>}
              <span className="text-sm font-semibold flex-1">{section.title}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {section.items.length}
              </Badge>
              {expanded.has(section.id) ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {expanded.has(section.id) && (
              <div className="border-t">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-3 border-b last:border-0 border-l-4 border-l-primary/30"
                  >
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Emergency contacts */}
      <div className="border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Contactos de emergencia</h3>
        <div className="grid grid-cols-2 gap-2">
          <a
            href="tel:133"
            className="flex items-center gap-2 border rounded-lg p-3 active:bg-muted transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold">Carabineros</p>
              <p className="text-sm font-bold text-blue-600">133</p>
            </div>
          </a>
          <a
            href="tel:132"
            className="flex items-center gap-2 border rounded-lg p-3 active:bg-muted transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-red-600" />
            </div>
            <div>
              <p className="text-xs font-semibold">Bomberos</p>
              <p className="text-sm font-bold text-red-600">132</p>
            </div>
          </a>
          <a
            href="tel:131"
            className="flex items-center gap-2 border rounded-lg p-3 active:bg-muted transition-colors"
          >
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs font-semibold">Ambulancia</p>
              <p className="text-sm font-bold text-green-600">131</p>
            </div>
          </a>
          <div className="flex items-center gap-2 border rounded-lg p-3">
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-semibold">Supervisor</p>
              <p className="text-xs text-muted-foreground">Consultar en sitio</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exam Section (Take Exam) ─────────────────────────────────

export function ExamenSection({
  session,
  onNavigate,
  assignmentId,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
  assignmentId?: string;
}) {
  const [examData, setExamData] = useState<{
    assignmentId: string;
    examTitle: string;
    questions: ExamQuestion[];
    status: string;
    answers?: Record<string, string>;
    score?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    correct: number;
    total: number;
    questions: Array<{
      id: string;
      questionText: string;
      options: string[] | null;
      correctAnswer: string | null;
      guardAnswer: string | null;
      isCorrect: boolean;
    }>;
  } | null>(null);
  const startTimeRef = useRef(Date.now());

  // If no assignmentId, find first pending
  const [pendingExams, setPendingExams] = useState<PendingExam[]>([]);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/guardia/exams?guardiaId=${session.guardiaId}`);
      const json = await res.json();
      if (json.success) setPendingExams(json.data.pending);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [session.guardiaId]);

  const fetchExam = useCallback(async (aId: string) => {
    try {
      setLoading(true);
      // Register open
      await fetch(
        `/api/portal/guardia/exams/${aId}?guardiaId=${session.guardiaId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open" }),
        },
      );

      const res = await fetch(
        `/api/portal/guardia/exams/${aId}?guardiaId=${session.guardiaId}`,
      );
      const json = await res.json();
      if (json.success) {
        setExamData(json.data);
        if (json.data.status === "completed" && json.data.answers) {
          setAnswers(json.data.answers);
        }
        startTimeRef.current = Date.now();
      }
    } catch {
      toast.error("Error al cargar examen");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    if (assignmentId) {
      fetchExam(assignmentId);
    } else {
      fetchPending();
    }
  }, [assignmentId, fetchExam, fetchPending]);

  const submitExam = async () => {
    if (!examData) return;
    setSubmitting(true);
    try {
      const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
      const res = await fetch(
        `/api/portal/guardia/exams/${examData.assignmentId}?guardiaId=${session.guardiaId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            answers,
            timeTakenSeconds: timeTaken,
          }),
        },
      );
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      } else {
        toast.error(json.error || "Error al enviar respuestas");
      }
    } catch {
      toast.error("Error al enviar examen");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando examen...</span>
      </div>
    );
  }

  // No assignmentId, show pending list
  if (!assignmentId && !examData) {
    if (pendingExams.length === 0) {
      return (
        <div className="px-4 py-12 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No tienes exámenes pendientes</p>
          <p className="text-xs text-muted-foreground mt-1">
            Te avisaremos cuando haya un nuevo examen.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-xs"
            onClick={() => onNavigate("inicio")}
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> Volver al inicio
          </Button>
        </div>
      );
    }

    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate("inicio")}
            className="p-2 -ml-2 rounded-lg active:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-base font-bold">Exámenes Pendientes</h2>
        </div>

        <div className="space-y-3">
          {pendingExams.map((exam) => (
            <button
              key={exam.assignmentId}
              className="w-full border rounded-xl p-4 text-left active:bg-muted transition-colors"
              onClick={() => fetchExam(exam.assignmentId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{exam.examTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {exam.questionCount} preguntas ·{" "}
                    {new Date(exam.sentAt).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] shrink-0",
                    exam.examType === "protocol"
                      ? "text-blue-600 border-blue-300"
                      : "text-purple-600 border-purple-300",
                  )}
                >
                  {exam.examType === "protocol" ? "Protocolo" : "Seguridad"}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Show result
  if (result) {
    const scoreColor = result.score >= 80
      ? "text-green-500"
      : result.score >= 60
        ? "text-yellow-500"
        : "text-red-500";
    const message = result.score >= 80
      ? "¡Excelente! Dominas el protocolo"
      : result.score >= 60
        ? "Buen intento. Revisa el protocolo"
        : "Necesitas repasar el protocolo";

    return (
      <div className="px-4 py-4 space-y-5">
        {/* Score */}
        <div className="text-center py-6">
          <p className={cn("text-5xl font-bold", scoreColor)}>{result.score}%</p>
          <p className="text-sm font-medium mt-2">{message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {result.correct} de {result.total} correctas
          </p>
        </div>

        {/* Review */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Revisión</h3>
          {result.questions.map((q, idx) => (
            <div
              key={q.id}
              className={cn(
                "border rounded-xl p-3",
                q.isCorrect ? "border-green-200 bg-green-50/50 dark:bg-green-950/20" : "border-red-200 bg-red-50/50 dark:bg-red-950/20",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5">
                  {q.isCorrect ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{idx + 1}. {q.questionText}</p>
                  {!q.isCorrect && q.options && (
                    <div className="mt-2 space-y-1">
                      {q.guardAnswer !== null && (
                        <p className="text-xs text-red-600">
                          Tu respuesta: {q.options[parseInt(q.guardAnswer)] ?? q.guardAnswer}
                        </p>
                      )}
                      {q.correctAnswer !== null && (
                        <p className="text-xs text-green-600 font-medium">
                          Correcta: {q.options[parseInt(q.correctAnswer)] ?? q.correctAnswer}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1 h-12 text-sm"
            onClick={() => onNavigate("inicio")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Inicio
          </Button>
          <Button
            className="flex-1 h-12 text-sm"
            onClick={() => onNavigate("resultados")}
          >
            <BarChart3 className="h-4 w-4 mr-1" /> Mis Resultados
          </Button>
        </div>
      </div>
    );
  }

  // Taking exam — one question at a time
  if (!examData || examData.questions.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Este examen no tiene preguntas.</p>
      </div>
    );
  }

  const question = examData.questions[currentQuestion];
  const totalQuestions = examData.questions.length;
  const selectedAnswer = answers[question.id] ?? null;
  const isLastQuestion = currentQuestion === totalQuestions - 1;
  const progress = ((currentQuestion + 1) / totalQuestions) * 100;

  return (
    <div className="px-4 py-4 flex flex-col min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold truncate flex-1">{examData.examTitle}</h2>
          <span className="text-xs text-muted-foreground shrink-0">
            Pregunta {currentQuestion + 1} de {totalQuestions}
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1">
        <p className="text-base font-medium leading-relaxed mb-5">
          {question.questionText}
        </p>

        {/* Options */}
        {question.options && Array.isArray(question.options) && (
          <div className="space-y-3">
            {(question.options as string[]).map((option, idx) => {
              const optKey = String(idx);
              const isSelected = selectedAnswer === optKey;
              return (
                <button
                  key={idx}
                  className={cn(
                    "w-full text-left border-2 rounded-xl p-4 transition-all active:scale-[0.98]",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30",
                  )}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [question.id]: optKey }))
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm flex-1">{option}</span>
                    {isSelected && (
                      <Check className="h-5 w-5 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-5 pb-2">
        <Button
          variant="outline"
          className="h-12 px-5"
          disabled={currentQuestion === 0}
          onClick={() => setCurrentQuestion((prev) => prev - 1)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Anterior
        </Button>
        <div className="flex-1" />
        {isLastQuestion ? (
          <Button
            className="h-12 px-5"
            disabled={selectedAnswer === null || submitting}
            onClick={submitExam}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Enviar
          </Button>
        ) : (
          <Button
            className="h-12 px-5"
            disabled={selectedAnswer === null}
            onClick={() => setCurrentQuestion((prev) => prev + 1)}
          >
            Siguiente
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Results Section ──────────────────────────────────────────

export function ResultadosSection({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    avgScore: number | null;
    completedCount: number;
    totalAssigned: number;
    trend: "up" | "stable" | "down";
  } | null>(null);
  const [results, setResults] = useState<ExamResult[]>([]);

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/portal/guardia/results?guardiaId=${session.guardiaId}`,
      );
      const json = await res.json();
      if (json.success) {
        setStats(json.data.stats);
        setResults(json.data.results);
      }
    } catch {
      toast.error("Error al cargar resultados");
    } finally {
      setLoading(false);
    }
  }, [session.guardiaId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando resultados...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate("inicio")}
          className="p-2 -ml-2 rounded-lg active:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-bold">Mis Resultados</h2>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-xl p-3 text-center">
            <p className={cn(
              "text-2xl font-bold",
              stats.avgScore != null
                ? stats.avgScore >= 80 ? "text-green-500" : stats.avgScore >= 60 ? "text-yellow-500" : "text-red-500"
                : "",
            )}>
              {stats.avgScore != null ? `${stats.avgScore}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Promedio</p>
          </div>
          <div className="border rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-500">
              {stats.completedCount}/{stats.totalAssigned}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Rendidos</p>
          </div>
          <div className="border rounded-xl p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              {stats.trend === "up" && <TrendingUp className="h-5 w-5 text-green-500" />}
              {stats.trend === "down" && <TrendingDown className="h-5 w-5 text-red-500" />}
              {stats.trend === "stable" && <span className="text-xl">➡️</span>}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Tendencia</p>
          </div>
        </div>
      )}

      {/* Results list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Historial</h3>
        {results.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            Aún no tienes resultados.
          </p>
        ) : (
          results.map((r) => (
            <div key={r.assignmentId} className="border rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.examTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.completedAt
                      ? new Date(r.completedAt).toLocaleDateString("es-CL", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : new Date(r.sentAt).toLocaleDateString("es-CL", {
                          day: "2-digit",
                          month: "short",
                        })}
                  </p>
                </div>
                {r.score != null ? (
                  <span className={cn(
                    "text-lg font-bold",
                    r.score >= 80 ? "text-green-500" : r.score >= 60 ? "text-yellow-500" : "text-red-500",
                  )}>
                    {Math.round(r.score)}%
                  </span>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    {r.status === "sent" ? "Pendiente" : r.status === "opened" ? "Abierto" : r.status}
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

// ─── Dashboard Cards (for InicioSection) ──────────────────────

export function GuardProtocolCard({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  if (!session.currentInstallationId) return null;

  return (
    <button
      onClick={() => onNavigate("protocolo")}
      className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <ClipboardList className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Mi Protocolo</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {session.currentInstallationName}
        </p>
      </div>
    </button>
  );
}

export function GuardPendingExamCard({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/exams?guardiaId=${session.guardiaId}`,
        );
        const json = await res.json();
        if (!cancelled && json.success) {
          setPendingCount(json.data.pending.length);
        }
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  return (
    <button
      onClick={() => onNavigate("examen")}
      className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 relative">
        <BookOpen className="h-5 w-5 text-amber-500" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {pendingCount}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {pendingCount > 0 ? "Examen Pendiente" : "Exámenes"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {pendingCount > 0 ? `${pendingCount} pendiente${pendingCount > 1 ? "s" : ""}` : "Sin pendientes"}
        </p>
      </div>
    </button>
  );
}

export function GuardResultsCard({
  session,
  onNavigate,
}: {
  session: GuardSession;
  onNavigate: (s: PortalSection) => void;
}) {
  const [avgScore, setAvgScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/portal/guardia/results?guardiaId=${session.guardiaId}`,
        );
        const json = await res.json();
        if (!cancelled && json.success) {
          setAvgScore(json.data.stats.avgScore);
        }
      } catch { /* silent */ }
    }
    load();
    return () => { cancelled = true; };
  }, [session.guardiaId]);

  return (
    <button
      onClick={() => onNavigate("resultados")}
      className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm active:bg-accent transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
        <BarChart3 className="h-5 w-5 text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Mis Resultados</p>
        <p className="text-[11px] text-muted-foreground">
          {avgScore != null ? `Promedio: ${avgScore}%` : "Ver historial"}
        </p>
      </div>
    </button>
  );
}
