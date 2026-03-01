"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Search,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface ExamSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
  _count: { questions: number; assignments: number };
  installation: { id: string; name: string };
}

// ─── Component ───────────────────────────────────────────────

export function ExamenesListClient() {
  const router = useRouter();
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchExams = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ops/exams");
      const json = await res.json();
      if (json.success) setExams(json.data);
    } catch {
      toast.error("Error al cargar exámenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const filtered = exams.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.installation.name.toLowerCase().includes(search.toLowerCase()),
  );

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar examen o instalación..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((exam) => (
          <button
            key={exam.id}
            onClick={() => router.push(`/ops/examenes/${exam.id}`)}
            className="w-full border rounded-lg p-3 hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {exam.type === "protocol" ? (
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{exam.title}</div>
                  <div className="text-xs text-muted-foreground">{exam.installation.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", STATUS_COLORS[exam.status] ?? "")}>
                  {STATUS_LABELS[exam.status] ?? exam.status}
                </span>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">{exam._count.questions} preg.</div>
                  <div className="text-xs text-muted-foreground">{exam._count.assignments} asig.</div>
                </div>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No se encontraron exámenes.
          </div>
        )}
      </div>
    </div>
  );
}
