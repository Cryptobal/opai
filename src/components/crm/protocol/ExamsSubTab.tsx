"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Send,
  Eye,
  Trash2,
  Loader2,
  Sparkles,
  ClipboardList,
  Shield,
  Users,
  BarChart3,
  AlertTriangle,
  ChevronRight,
  GripVertical,
  X,
  Check,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExamStats = {
  activeExams: number;
  totalGuards: number;
  evaluatedGuards: number;
  avgScore: number;
  lowPerformanceCount: number;
};

type Exam = {
  id: string;
  title: string;
  type: "protocol" | "security_general";
  status: "draft" | "active" | "archived";
  questionCount: number;
  sentCount: number;
  completedCount: number;
  avgScore: number;
  createdAt: string;
};

type GuardOverview = {
  id: string;
  firstName: string;
  lastName: string;
  shift: string;
  pendingCount: number;
  lastExamDate: string | null;
  completedCount: number;
  avgScore: number;
  trend: "up" | "down" | "stable";
};

type GuardHistoryEntry = {
  examId: string;
  examTitle: string;
  examType: "protocol" | "security_general";
  date: string;
  openedAt: string | null;
  timeTakenMinutes: number | null;
  score: number | null;
};

type GuardHistory = {
  guard: { id: string; firstName: string; lastName: string; shift: string };
  overallAvg: number;
  totalCompleted: number;
  entries: GuardHistoryEntry[];
};

type QuestionDraft = {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
};

type Props = { installationId: string };

type SubTab = "todos" | "protocol" | "security" | "guards";
type CreateStep = 1 | 2 | 3;
type Schedule = "now" | "on_assign" | "recurring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number) {
  if (score >= 80) return "text-status-ok-fg";
  if (score >= 60) return "text-status-warn-fg";
  return "text-status-danger-fg";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-status-ok";
  if (score >= 60) return "bg-status-warn";
  return "bg-status-danger";
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBg(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${scoreColor(score)}`}>
        {score}%
      </span>
    </div>
  );
}

function initials(first: string, last: string) {
  return `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}`;
}

function trendIcon(t: "up" | "down" | "stable") {
  if (t === "up") return "📈";
  if (t === "down") return "📉";
  return "➡️";
}

function typeBadge(type: "protocol" | "security_general") {
  if (type === "protocol")
    return <Badge className="bg-status-info-soft text-status-info-fg border-transparent">📋 Protocolo</Badge>;
  return <Badge className="bg-tint-violet text-tint-violet-fg border-transparent">🛡️ Seguridad</Badge>;
}

function statusBadge(status: "draft" | "active" | "archived") {
  if (status === "active") return <Badge variant="success">Activo</Badge>;
  if (status === "draft") return <Badge variant="secondary">Borrador</Badge>;
  return <Badge variant="outline">Archivado</Badge>;
}

let _qid = 0;
function newQuestion(): QuestionDraft {
  return {
    id: `q_${++_qid}_${Date.now()}`,
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExamsSubTab({ installationId }: Props) {
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [guards, setGuards] = useState<GuardOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("todos");

  // Create exam dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"protocol" | "security_general">("protocol");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [schedule, setSchedule] = useState<Schedule>("now");
  // Recurring frequency in days. `null` = inherit tenant default.
  const [recurDays, setRecurDays] = useState<number | null>(null);
  // Tenant default loaded lazily when user picks "recurring".
  const [tenantDefaultDays, setTenantDefaultDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // AI knowledge sources (DocOperacional + legacy fallback) for security_general
  type AiSource = {
    id: string;
    origin: "doc_operacional" | "protocol_document_legacy";
    scope: "global" | "instalacion";
    fileName: string;
    fileSize: number | null;
    tipoCodigo: string | null;
    tipoNombre: string | null;
  };
  const [aiSources, setAiSources] = useState<AiSource[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [aiSourcesLoading, setAiSourcesLoading] = useState(false);
  type UsedAiSource = {
    id: string;
    origin: "doc_operacional" | "protocol_document_legacy";
    fileName: string;
  };
  const [usedSources, setUsedSources] = useState<UsedAiSource[]>([]);

  // Send dialog
  const [sendExamId, setSendExamId] = useState<string | null>(null);
  const [sendGuards, setSendGuards] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  // View exam detail dialog
  const [viewExamId, setViewExamId] = useState<string | null>(null);
  const viewExam = exams.find((e) => e.id === viewExamId) ?? null;
  const [viewQuestions, setViewQuestions] = useState<Array<{ id: string; questionText: string; options: string[]; correctAnswer: number; order: number }>>([]);
  const [viewQuestionsLoading, setViewQuestionsLoading] = useState(false);

  // Guard history dialog
  const [historyGuardId, setHistoryGuardId] = useState<string | null>(null);
  const [guardHistory, setGuardHistory] = useState<GuardHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ----- Fetch helpers -----

  const base = `/api/installations/${installationId}/exams`;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, examsRes, guardsRes] = await Promise.all([
        fetch(`${base}/stats`),
        fetch(base),
        fetch(`${base}/guards`),
      ]);
      if (statsRes.ok) {
        const s = await statsRes.json();
        if (s.success) setStats(s.data);
      }
      if (examsRes.ok) {
        const e = await examsRes.json();
        setExams(Array.isArray(e) ? e : (e?.success ? (e.data ?? []) : []));
      }
      if (guardsRes.ok) {
        const g = await guardsRes.json();
        const raw = g?.success ? (g.data ?? []) : [];
        const arr = Array.isArray(raw) ? raw : [];
        setGuards(
          arr.map((x: { guardId: string; name: string; pendingCount: number; lastExamDate: string | null; completedCount: number; avgScore: number | null; trend: string | null }) => {
            const parts = (x.name ?? "").trim().split(/\s+/);
            return {
              id: x.guardId,
              firstName: parts[0] ?? x.name,
              lastName: parts.slice(1).join(" ") ?? "",
              shift: "-",
              pendingCount: x.pendingCount ?? 0,
              lastExamDate: x.lastExamDate,
              completedCount: x.completedCount ?? 0,
              avgScore: x.avgScore ?? 0,
              trend: (x.trend ?? "stable") as "up" | "down" | "stable",
            };
          })
        );
      }
    } catch {
      toast.error("Error al cargar datos de exámenes");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Fetch exam questions when viewing
  useEffect(() => {
    if (!viewExamId) {
      setViewQuestions([]);
      return;
    }
    let cancelled = false;
    setViewQuestionsLoading(true);
    fetch(`${base}/${viewExamId}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((res: { success?: boolean; data?: { questions?: Array<{ id: string; questionText: string; options: string[]; correctAnswer: number; order: number }> } }) => {
        if (!cancelled && res?.success && res.data?.questions) {
          setViewQuestions(res.data.questions);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setViewQuestionsLoading(false); });
    return () => { cancelled = true; };
  }, [viewExamId, base]);

  // Guard history
  useEffect(() => {
    if (!historyGuardId) {
      setGuardHistory(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    fetch(`${base}/guards/${historyGuardId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((res: { success?: boolean; data?: { guard: { id: string; name: string }; history: Array<{ assignmentId: string; examTitle: string; examType: string; sentAt: string; completedAt: string | null; score: number | null; timeTakenSecs: number | null }>; summary: { avgScore: number | null; completedCount: number } } }) => {
        if (!cancelled && res?.success && res.data) {
          const d = res.data;
          const parts = (d.guard?.name ?? "").trim().split(/\s+/);
          setGuardHistory({
            guard: {
              id: d.guard.id,
              firstName: parts[0] ?? d.guard.name,
              lastName: parts.slice(1).join(" ") ?? "",
              shift: "-",
            },
            overallAvg: d.summary?.avgScore ?? 0,
            totalCompleted: d.summary?.completedCount ?? 0,
            entries: (d.history ?? []).map((h) => ({
              examId: h.assignmentId,
              examTitle: h.examTitle,
              examType: h.examType as "protocol" | "security_general",
              date: h.completedAt ?? h.sentAt,
              openedAt: null,
              timeTakenMinutes: h.timeTakenSecs != null ? Math.round(h.timeTakenSecs / 60) : null,
              score: h.score,
            })),
          });
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Error al cargar historial");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyGuardId, base]);

  // Fetch tenant knowledge default once when user picks "recurring"
  useEffect(() => {
    if (schedule !== "recurring" || tenantDefaultDays !== null) return;
    let cancelled = false;
    fetch("/api/configuracion/knowledge")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: { success?: boolean; data?: { recurringDefaultDays?: number } }) => {
        if (!cancelled && json?.success && json.data?.recurringDefaultDays) {
          setTenantDefaultDays(json.data.recurringDefaultDays);
        }
      })
      .catch(() => { /* fallback al placeholder genérico */ });
    return () => { cancelled = true; };
  }, [schedule, tenantDefaultDays]);

  // Fetch AI knowledge sources when needed
  useEffect(() => {
    if (!createOpen || newType !== "security_general") return;
    let cancelled = false;
    setAiSourcesLoading(true);
    fetch(`${base}/ai-sources`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: { success?: boolean; data?: AiSource[] }) => {
        if (!cancelled && json.success) setAiSources(json.data ?? []);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) setAiSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, newType, base]);

  // ----- Actions -----

  async function handleGenerateAI() {
    if (newType === "security_general" && selectedDocIds.length === 0) {
      toast.error("Selecciona al menos un documento global para generar preguntas.");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch(`${base}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionCount, type: newType, documentIds: selectedDocIds }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          questions?: Array<{ questionText?: string; options?: string[]; correctAnswer?: number }>;
          sources?: UsedAiSource[];
        };
        error?: string;
      };
      if (!res.ok) {
        const msg = json?.error ?? "No se pudieron generar preguntas.";
        if (msg.includes("secciones") || msg.includes("protocolo")) {
          toast.error("Crea primero un protocolo en la pestaña Secciones.");
        } else if (msg.includes("IA") || msg.includes("configurado")) {
          toast.error("Configura un proveedor de IA en Configuración → Inteligencia Artificial.");
        } else {
          toast.error(msg);
        }
        return;
      }
      const raw = json?.data?.questions ?? [];
      const mapped: QuestionDraft[] = raw.map((q) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        const options: [string, string, string, string] = [
          opts[0] ?? "",
          opts[1] ?? "",
          opts[2] ?? "",
          opts[3] ?? "",
        ];
        return {
          id: `q_${++_qid}_${Date.now()}`,
          text: q.questionText ?? "",
          options,
          correctIndex: Math.min(3, Math.max(0, q.correctAnswer ?? 0)),
        };
      });
      setQuestions(mapped);
      setUsedSources(json?.data?.sources ?? []);
      toast.success(mapped.length > 0 ? `Se generaron ${mapped.length} preguntas` : "No se generaron preguntas. Agrega manualmente.");
    } catch {
      toast.error("No se pudieron generar preguntas. Verifica la configuración de IA.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSaveExam(sendAfter: boolean) {
    if (!newTitle.trim()) {
      toast.error("Ingresa un título para el examen");
      return;
    }
    if (questions.length === 0) {
      toast.error("Agrega al menos una pregunta");
      return;
    }
    const invalid = questions.find(
      (q) => !q.text.trim() || q.options.some((o) => !o.trim())
    );
    if (invalid) {
      toast.error("Completa todas las preguntas y opciones");
      return;
    }
    setSaving(true);
    try {
      const scheduleTypeMap = { now: "manual" as const, on_assign: "on_assignment" as const, recurring: "recurring" as const };
      const payload = {
        title: newTitle.trim(),
        type: newType,
        scheduleType: scheduleTypeMap[schedule],
        // recurringDays: null = hereda default tenant; positivo = override
        recurringDays: schedule === "recurring" ? recurDays : undefined,
        passingScore: 60,
        questions: questions.map((q, i) => ({
          questionText: q.text,
          questionType: "multiple_choice" as const,
          options: q.options,
          correctAnswer: q.correctIndex,
          sectionRef: "",
          order: i,
        })),
        sources: newType === "security_general" ? usedSources : undefined,
      };
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { success?: boolean; data?: { id: string }; error?: string };
      if (!res.ok) {
        toast.error(json?.error ?? "Error al guardar el examen");
        return;
      }
      const exam = json.data as Exam;
      toast.success(sendAfter ? "Examen creado. Selecciona los guardias para enviar." : "Borrador guardado");
      resetCreateDialog();
      await fetchAll();
      if (sendAfter && exam?.id) setSendExamId(exam.id);
    } catch {
      toast.error("Error al guardar el examen");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendExam() {
    if (!sendExamId) return;
    if (sendGuards.length === 0) {
      toast.error("Selecciona al menos un guardia");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${base}/${sendExamId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardIds: sendGuards }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json?.error ?? "Error al enviar el examen");
        return;
      }
      toast.success(`Examen enviado a ${sendGuards.length} guardia${sendGuards.length !== 1 ? "s" : ""}. Lo verán en su portal.`);
      setSendExamId(null);
      setSendGuards([]);
      await fetchAll();
    } catch {
      toast.error("Error al enviar el examen");
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteExam(examId: string) {
    try {
      const res = await fetch(`${base}/${examId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Examen eliminado");
      await fetchAll();
    } catch {
      toast.error("Error al eliminar el examen");
    }
  }

  function resetCreateDialog() {
    setCreateOpen(false);
    setCreateStep(1);
    setNewTitle("");
    setNewType("protocol");
    setQuestions([]);
    setQuestionCount(10);
    setSchedule("now");
    setRecurDays(null);
    setSelectedDocIds([]);
    setAiSources([]);
    setUsedSources([]);
  }

  // ----- Question editing helpers -----

  function updateQuestion(id: string, patch: Partial<QuestionDraft>) {
    setQuestions((qs) =>
      qs.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  }

  function updateOption(qId: string, optIdx: number, value: string) {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options] as [string, string, string, string];
        opts[optIdx] = value;
        return { ...q, options: opts };
      })
    );
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  // ----- Filtered exams -----

  const filteredExams =
    subTab === "protocol"
      ? exams.filter((e) => e.type === "protocol")
      : subTab === "security"
        ? exams.filter((e) => e.type === "security_general")
        : exams;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hidden trigger for the sticky "Crear examen" button */}
      <button data-action="create-exam" className="hidden" onClick={() => setCreateOpen(true)} />

      {/* ============ KPI STATS ROW ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="📝"
          label="Exámenes activos"
          value={stats?.activeExams ?? 0}
        />
        <KpiCard
          icon="👮"
          label="Evaluados"
          value={`${stats?.evaluatedGuards ?? 0}/${stats?.totalGuards ?? 0}`}
        />
        <KpiCard
          icon="📊"
          label="Score promedio"
          value={`${stats?.avgScore ?? 0}%`}
          valueClass={scoreColor(stats?.avgScore ?? 0)}
        />
        <KpiCard
          icon="⚠️"
          label="Bajo rendimiento"
          value={stats?.lowPerformanceCount ?? 0}
          valueClass={
            (stats?.lowPerformanceCount ?? 0) > 0 ? "text-status-danger-fg" : undefined
          }
        />
      </div>

      {/* ============ FILTER + GUARD VIEW ============ */}
      <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1 text-sm w-fit">
        {(
          [
            { key: "todos", label: "Todos" },
            { key: "protocol", label: "📋 Protocolo" },
            { key: "security", label: "🛡️ Seguridad" },
            { key: "guards", label: "👮 Por Guardia" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
              subTab === t.key
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ============ TAB CONTENT ============ */}
      {subTab === "guards" ? (
        <GuardsView
          guards={guards}
          onSelect={(id) => setHistoryGuardId(id)}
        />
      ) : (
        <ExamsList
          exams={filteredExams}
          onSend={(id) => {
            setSendExamId(id);
            setSendGuards([]);
          }}
          onDelete={handleDeleteExam}
          onView={(id) => setViewExamId(id)}
        />
      )}

      {/* ============ CREATE EXAM DIALOG ============ */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && resetCreateDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear examen</DialogTitle>
            <DialogDescription>
              Paso {createStep} de 3
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Título del examen</Label>
                <Input
                  placeholder="Ej: Evaluación protocolo acceso"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de examen</Label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: "protocol" as const,
                        icon: <ClipboardList className="h-5 w-5" />,
                        label: "📋 Protocolo",
                        desc: "Preguntas sobre protocolos de la instalación",
                      },
                      {
                        value: "security_general" as const,
                        icon: <Shield className="h-5 w-5" />,
                        label: "🛡️ Seguridad General",
                        desc: "Conocimientos generales de seguridad",
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setNewType(opt.value)}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        newType === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-sm">
                        {opt.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setCreateStep(2)}
                  disabled={!newTitle.trim()}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-4 py-2">
              {/* Document selector for security_general */}
              {newType === "security_general" && (
                <div className="space-y-2">
                  <Label>Documentos base para generar preguntas</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecciona los documentos marcados como base de IA (Plan
                    de Evacuación, Plan de Contingencia, Matriz de Riesgos,
                    etc.) de los que se generarán las preguntas.
                  </p>
                  {aiSourcesLoading ? (
                    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando documentos...
                    </div>
                  ) : aiSources.length === 0 ? (
                    <div className="rounded-lg border border-status-warn-border bg-status-warn-soft p-3">
                      <p className="text-xs text-status-warn-fg">
                        No hay documentos disponibles para la IA. Sube
                        documentos y activa el switch &quot;Usar como base de
                        IA&quot; en{" "}
                        <a
                          href="/opai/configuracion/documentos-operacionales"
                          className="underline font-medium"
                          target="_blank"
                        >
                          Configuración → Documentos Operacionales
                        </a>
                        .
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto rounded-lg border p-2">
                      {(["global", "instalacion"] as const).map((scope) => {
                        const docs = aiSources.filter((s) => s.scope === scope);
                        if (docs.length === 0) return null;
                        return (
                          <div key={scope} className="space-y-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 px-1">
                              {scope === "global"
                                ? "📋 Empresa (globales)"
                                : "📍 Esta instalación"}
                            </p>
                            {docs.map((doc) => (
                              <label
                                key={doc.id}
                                className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                                  selectedDocIds.includes(doc.id)
                                    ? "bg-primary/10 border border-primary/30"
                                    : "hover:bg-muted/40"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDocIds.includes(doc.id)}
                                  onChange={(e) =>
                                    setSelectedDocIds((prev) =>
                                      e.target.checked
                                        ? [...prev, doc.id]
                                        : prev.filter((x) => x !== doc.id),
                                    )
                                  }
                                  className="accent-primary"
                                />
                                <FileText className="h-4 w-4 text-status-info-fg shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    {doc.fileName}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    {doc.tipoNombre && (
                                      <span className="break-words">
                                        {doc.tipoNombre}
                                      </span>
                                    )}
                                    {doc.fileSize != null && (
                                      <span>
                                        {(doc.fileSize / 1024 / 1024).toFixed(1)}{" "}
                                        MB
                                      </span>
                                    )}
                                    {doc.origin === "protocol_document_legacy" && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0"
                                      >
                                        legacy
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Cantidad de preguntas</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    className="w-24 h-9"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Math.min(50, Number(e.target.value) || 10)))}
                  />
                  <span className="text-xs text-muted-foreground">preguntas (1-50)</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAI}
                  disabled={aiLoading || (newType === "security_general" && selectedDocIds.length === 0)}
                >
                  {aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  🤖 Generar {questionCount} preguntas con IA
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuestions((q) => [...q, newQuestion()])}
                >
                  <Plus className="h-4 w-4" />
                  + Agregar pregunta
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {newType === "protocol"
                  ? "La IA usa el protocolo de la instalación. Si falla, agrega preguntas manualmente."
                  : selectedDocIds.length > 0
                    ? `Se usarán ${selectedDocIds.length} documento${selectedDocIds.length !== 1 ? "s" : ""} para generar preguntas.`
                    : "Selecciona documentos arriba o agrega preguntas manualmente."}
              </p>

              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {questions.map((q, qi) => (
                  <div
                    key={q.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 mt-2 text-muted-foreground shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            P{qi + 1}
                          </span>
                          <Input
                            className="flex-1"
                            placeholder="Texto de la pregunta"
                            value={q.text}
                            onChange={(e) =>
                              updateQuestion(q.id, { text: e.target.value })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => removeQuestion(q.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                          {(["A", "B", "C", "D"] as const).map((letter, oi) => (
                            <div
                              key={letter}
                              className="flex items-center gap-2"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion(q.id, { correctIndex: oi })
                                }
                                className={`h-6 w-6 rounded-full border text-xs font-medium flex items-center justify-center shrink-0 transition-colors ${
                                  q.correctIndex === oi
                                    ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                                    : "border-border text-muted-foreground hover:border-muted-foreground"
                                }`}
                              >
                                {q.correctIndex === oi ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  letter
                                )}
                              </button>
                              <Input
                                className="flex-1 h-8 text-xs"
                                placeholder={`Opción ${letter}`}
                                value={q.options[oi]}
                                onChange={(e) =>
                                  updateOption(q.id, oi, e.target.value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuestions((qs) => [...qs, newQuestion()])}
              >
                <Plus className="h-4 w-4" />
                Agregar pregunta
              </Button>

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setCreateStep(1)}>
                  Atrás
                </Button>
                <Button
                  onClick={() => setCreateStep(3)}
                  disabled={questions.length === 0}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {createStep === 3 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Programación de envío</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      { value: "now" as const, label: "Enviar ahora" },
                      { value: "on_assign" as const, label: "Al asignar guardia" },
                      { value: "recurring" as const, label: "Recurrente" },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setSchedule(s.value)}
                      className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                        schedule === s.value
                          ? "border-primary bg-primary/5 font-medium"
                          : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {schedule === "recurring" && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Cada</Label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        placeholder={
                          tenantDefaultDays != null
                            ? `${tenantDefaultDays}`
                            : "default tenant"
                        }
                        className="w-24 h-8 text-xs"
                        value={recurDays ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setRecurDays(null);
                            return;
                          }
                          const n = Number.parseInt(v, 10);
                          setRecurDays(Number.isFinite(n) && n > 0 ? n : null);
                        }}
                      />
                      <span className="text-xs text-muted-foreground">días</span>
                      {recurDays !== null && (
                        <button
                          type="button"
                          onClick={() => setRecurDays(null)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          Heredar del tenant
                        </button>
                      )}
                    </div>
                    {recurDays === null && (
                      <p className="text-[11px] text-muted-foreground">
                        {tenantDefaultDays != null
                          ? `Hereda del default tenant: ${tenantDefaultDays} días.`
                          : "Hereda del default tenant configurado en /opai/configuracion/conocimiento."}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
                <p>
                  <span className="font-medium">Examen:</span> {newTitle}
                </p>
                <p>
                  <span className="font-medium">Tipo:</span>{" "}
                  {newType === "protocol" ? "📋 Protocolo" : "🛡️ Seguridad General"}
                </p>
                <p>
                  <span className="font-medium">Preguntas:</span>{" "}
                  {questions.length}
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setCreateStep(2)}>
                  Atrás
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSaveExam(false)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar borrador
                </Button>
                <Button
                  onClick={() => handleSaveExam(true)}
                  disabled={saving}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear y enviar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ SEND EXAM DIALOG ============ */}
      <Dialog
        open={!!sendExamId}
        onOpenChange={(o) => {
          if (!o) {
            setSendExamId(null);
            setSendGuards([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar examen</DialogTitle>
            <DialogDescription>
              Selecciona los guardias que recibirán este examen. Lo verán en el Portal del Guardia para responderlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto py-2">
            {guards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay guardias asignados a esta instalación.
              </p>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() =>
                    setSendGuards((prev) =>
                      prev.length === guards.length
                        ? []
                        : guards.map((g) => g.id)
                    )
                  }
                >
                  {sendGuards.length === guards.length
                    ? "Deseleccionar todos"
                    : "Seleccionar todos"}
                </Button>
                {guards.map((g) => (
                  <label
                    key={g.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={sendGuards.includes(g.id)}
                      onChange={(e) => {
                        setSendGuards((prev) =>
                          e.target.checked
                            ? [...prev, g.id]
                            : prev.filter((x) => x !== g.id)
                        );
                      }}
                      className="accent-primary"
                    />
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                      {initials(g.firstName, g.lastName)}
                    </div>
                    <span className="text-sm">
                      {g.firstName} {g.lastName}
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleSendExam}
              disabled={sending || sendGuards.length === 0}
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" />
              Enviar a {sendGuards.length} guardia
              {sendGuards.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ VIEW EXAM DIALOG ============ */}
      <Dialog
        open={!!viewExamId}
        onOpenChange={(o) => !o && setViewExamId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewExam ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewExam.title}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 flex-wrap pt-1">
                  {typeBadge(viewExam.type)}
                  {statusBadge(viewExam.status)}
                  <span className="text-xs text-muted-foreground">
                    Creado {new Date(viewExam.createdAt).toLocaleDateString("es-CL")}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-lg font-semibold">{viewExam.questionCount}</p>
                    <p className="text-[11px] text-muted-foreground">Preguntas</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-lg font-semibold">{viewExam.sentCount}</p>
                    <p className="text-[11px] text-muted-foreground">Enviados</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-lg font-semibold">{viewExam.completedCount}</p>
                    <p className="text-[11px] text-muted-foreground">Completados</p>
                  </div>
                </div>
                {viewExam.avgScore != null && (
                  <div className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm text-muted-foreground">Nota promedio</span>
                    <span className={`text-lg font-bold ${scoreColor(viewExam.avgScore)}`}>
                      {viewExam.avgScore}%
                    </span>
                  </div>
                )}

                {/* Questions list */}
                <div className="space-y-2 pt-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Preguntas del examen</h4>
                  {viewQuestionsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : viewQuestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Sin preguntas cargadas.</p>
                  ) : (
                    viewQuestions.sort((a, b) => a.order - b.order).map((q, qi) => (
                      <div key={q.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                        <p className="text-sm font-medium">
                          <span className="text-xs text-muted-foreground mr-1.5">P{qi + 1}.</span>
                          {q.questionText}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-4">
                          {(Array.isArray(q.options) ? q.options : []).map((opt: string, oi: number) => {
                            const isCorrect = oi === q.correctAnswer;
                            return (
                              <div
                                key={oi}
                                className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                                  isCorrect
                                    ? "bg-status-ok-soft text-status-ok-fg font-medium"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <span className={`h-4 w-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                                  isCorrect ? "border-status-ok-border bg-status-ok-soft" : "border-border"
                                }`}>
                                  {isCorrect ? <Check className="h-2.5 w-2.5" /> : String.fromCharCode(65 + oi)}
                                </span>
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewExamId(null);
                    setSendExamId(viewExam.id);
                    setSendGuards([]);
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar a guardias
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ============ GUARD HISTORY DIALOG ============ */}
      <Dialog
        open={!!historyGuardId}
        onOpenChange={(o) => !o && setHistoryGuardId(null)}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : guardHistory ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Historial — {guardHistory.guard.firstName}{" "}
                  {guardHistory.guard.lastName}
                </DialogTitle>
                <DialogDescription>
                  {guardHistory.totalCompleted} exámenes completados · Promedio
                  general:{" "}
                  <span className={scoreColor(guardHistory.overallAvg)}>
                    {guardHistory.overallAvg}%
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                {guardHistory.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Sin exámenes registrados.
                  </p>
                ) : (
                  guardHistory.entries.map((e) => (
                    <div
                      key={`${e.examId}-${e.date}`}
                      className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">
                            {e.examTitle}
                          </span>
                          {typeBadge(e.examType)}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>
                            {new Date(e.date).toLocaleDateString("es-CL")}
                          </span>
                          {e.openedAt && (
                            <span>
                              Abierto:{" "}
                              {new Date(e.openedAt).toLocaleTimeString(
                                "es-CL",
                                { hour: "2-digit", minute: "2-digit" }
                              )}
                            </span>
                          )}
                          {e.timeTakenMinutes != null && (
                            <span>{e.timeTakenMinutes} min</span>
                          )}
                        </div>
                      </div>
                      {e.score != null && (
                        <div className="sm:w-32">
                          <ScoreBar score={e.score} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: string;
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 p-3">
        <span className="text-xl">{icon}</span>
        <div className="min-w-0">
          <p className={`text-lg font-semibold tabular-nums leading-tight ${valueClass ?? "text-foreground"}`}>
            {value}
          </p>
          <p className="text-xs text-muted-foreground break-words">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function ExamsList({
  exams,
  onSend,
  onDelete,
  onView,
}: {
  exams: Exam[];
  onSend: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
}) {
  if (exams.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No hay exámenes en esta categoría.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {exams.map((exam) => (
        <Card key={exam.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <CardTitle className="truncate">{exam.title}</CardTitle>
                {typeBadge(exam.type)}
                {statusBadge(exam.status)}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSend(exam.id)}
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onView(exam.id)}
                  title="Ver detalle"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-status-danger-fg hover:text-status-danger-fg"
                  onClick={() => onDelete(exam.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {exam.questionCount} preguntas · {exam.sentCount} enviados ·{" "}
              {exam.completedCount} completados
              {exam.avgScore != null && (
                <>
                  {" "}· Nota promedio:{" "}
                  <span className={scoreColor(exam.avgScore)}>
                    {exam.avgScore}%
                  </span>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GuardsView({
  guards,
  onSelect,
}: {
  guards: GuardOverview[];
  onSelect: (id: string) => void;
}) {
  if (guards.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No hay guardias asignados a esta instalación.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {guards.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className="w-full rounded-lg border border-border bg-card p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
        >
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
            {initials(g.firstName, g.lastName)}
          </div>
          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-sm font-medium truncate min-w-[120px]">
              {g.firstName} {g.lastName}
            </span>
            <Badge variant="outline" className="text-[10px] w-fit">
              {g.shift}
            </Badge>
            {g.pendingCount > 0 && (
              <Badge variant="destructive" className="text-[10px] w-fit">
                {g.pendingCount} pendiente{g.pendingCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {g.lastExamDate
                ? new Date(g.lastExamDate).toLocaleDateString("es-CL")
                : "Sin exámenes"}
            </span>
            <span className="text-xs text-muted-foreground">
              {g.completedCount} completado{g.completedCount !== 1 ? "s" : ""}
            </span>
            <div className="sm:w-28">
              <ScoreBar score={g.avgScore} />
            </div>
            <span className="text-sm">{trendIcon(g.trend)}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
