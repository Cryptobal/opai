"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
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

interface Exam {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduleType: string;
  questions: ExamQuestion[];
  _count: { assignments: number };
  installation: { id: string; name: string };
}

interface ExamEditorProps {
  examId: string;
  onBack?: () => void;
}

// ─── Component ───────────────────────────────────────────────

export function ExamEditorClient({ examId, onBack }: ExamEditorProps) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit question
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", "", "", ""],
    correctAnswer: "",
  });

  // Add question
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", "", "", ""],
    correctAnswer: "",
  });

  // AI generate
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCount, setAiCount] = useState("10");
  const [aiTopic, setAiTopic] = useState("");

  const fetchExam = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/exams/${examId}`);
      const json = await res.json();
      if (json.success) setExam(json.data);
    } catch {
      toast.error("Error al cargar examen");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  // ─── Status toggle ─────────────────────────────────────────

  const toggleStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/ops/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setExam((prev) => (prev ? { ...prev, status: newStatus } : prev));
        toast.success(`Examen ${newStatus === "active" ? "activado" : "archivado"}`);
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  // ─── Question CRUD ─────────────────────────────────────────

  const saveQuestion = async (questionId: string) => {
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
        setExam((prev) =>
          prev
            ? {
                ...prev,
                questions: prev.questions.map((q) =>
                  q.id === questionId ? json.data : q,
                ),
              }
            : prev,
        );
        setEditingQuestion(null);
        toast.success("Pregunta actualizada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al actualizar pregunta");
    }
  };

  const deleteQuestion = async (questionId: string) => {
    try {
      const res = await fetch(`/api/ops/exams/${examId}/questions/${questionId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setExam((prev) =>
          prev
            ? { ...prev, questions: prev.questions.filter((q) => q.id !== questionId) }
            : prev,
        );
        toast.success("Pregunta eliminada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar pregunta");
    }
  };

  const addQuestion = async () => {
    if (!newQuestion.questionText.trim()) return;
    try {
      const body: Record<string, unknown> = {
        questionText: newQuestion.questionText,
        questionType: newQuestion.questionType,
        correctAnswer: newQuestion.correctAnswer,
        order: exam?.questions.length ?? 0,
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
        setExam((prev) =>
          prev ? { ...prev, questions: [...prev.questions, json.data] } : prev,
        );
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

  // ─── AI Generate ───────────────────────────────────────────

  const generateAiQuestions = async () => {
    setAiLoading(true);
    try {
      const body: Record<string, unknown> = {
        questionCount: parseInt(aiCount) || 10,
      };
      if (exam?.type === "security_general") {
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
        setExam((prev) =>
          prev ? { ...prev, questions: [...prev.questions, ...json.data] } : prev,
        );
        toast.success(`${json.data.length} preguntas generadas con IA`);
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al generar preguntas");
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading || !exam) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          {onBack && (
            <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-1">
              ← Volver a exámenes
            </button>
          )}
          <h3 className="text-sm font-semibold">{exam.title}</h3>
          <p className="text-xs text-muted-foreground">
            {exam.installation.name} · {exam.questions.length} preguntas · {exam._count.assignments} asignaciones
          </p>
        </div>
        <div className="flex gap-2">
          <Badge
            variant={exam.status === "active" ? "default" : "secondary"}
            className="cursor-pointer"
            onClick={() => toggleStatus(exam.status === "active" ? "draft" : "active")}
          >
            {exam.status === "active" ? "Activo" : exam.status === "draft" ? "Borrador" : "Archivado"}
          </Badge>
        </div>
      </div>

      {/* AI Generate section */}
      <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Generar preguntas con IA
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {exam.type === "security_general" && (
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
          <Button size="sm" onClick={generateAiQuestions} disabled={aiLoading}>
            {aiLoading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Generar
          </Button>
        </div>
      </div>

      {/* Questions list */}
      <div className="space-y-2">
        {exam.questions.map((q, idx) => (
          <div key={q.id} className="border rounded-lg overflow-hidden">
            {editingQuestion === q.id ? (
              <QuestionForm
                form={editForm}
                setForm={setEditForm}
                onSave={() => saveQuestion(q.id)}
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
                      onClick={() => deleteQuestion(q.id)}
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

      {/* Add question */}
      {showAddQuestion ? (
        <div className="border rounded-lg overflow-hidden">
          <QuestionForm
            form={newQuestion}
            setForm={setNewQuestion}
            onSave={addQuestion}
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

// ─── Question Form ───────────────────────────────────────────

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
        onValueChange={(v) => {
          setForm({ ...form, questionType: v, correctAnswer: "" });
        }}
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
              <span className="text-xs text-muted-foreground w-5">{String.fromCharCode(65 + i)})</span>
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
