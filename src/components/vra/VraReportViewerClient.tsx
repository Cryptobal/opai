"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Download,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  key: string;
  title: string;
  outputType: string;
  sortOrder: number;
  status: string;
  contentJson: unknown;
  errorMessage: string | null;
};

type Report = {
  id: string;
  title: string;
  status: string;
  riskLevel: string | null;
  version: number;
  generatedAt: string | null;
  portalVisible: boolean;
  pdfUrl: string | null;
  publicToken: string | null;
  installation: { id: string; name: string; address: string | null };
  sections: Section[];
};

const ANNEX_TYPES = new Set(["photo_gallery", "norms_table", "glossary"]);

function computeNumbering(sections: Section[]): Map<string, string> {
  const result = new Map<string, string>();
  let mainCount = 0;
  let annexCount = 0;
  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of sorted) {
    if (ANNEX_TYPES.has(s.outputType)) {
      annexCount++;
      result.set(s.id, String.fromCharCode(64 + annexCount));
    } else {
      mainCount++;
      result.set(s.id, String(mainCount));
    }
  }
  return result;
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-600",
  high: "bg-orange-600",
  medium: "bg-yellow-600",
  low: "bg-emerald-600",
};

const RISK_LABELS: Record<string, string> = {
  critical: "CRÍTICO",
  high: "ALTO",
  medium: "MEDIO",
  low: "BAJO",
};

export function VraReportViewerClient({ report: initialReport }: { report: Report }) {
  const [report, setReport] = useState(initialReport);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>(report.sections[0]?.id ?? "");

  const numbering = useMemo(() => computeNumbering(report.sections), [report.sections]);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/vra/reports/${report.id}/export-pdf`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("PDF generado y vinculado al sistema documental");
      window.open(json.pdfUrl, "_blank");
      setReport({ ...report, pdfUrl: json.pdfUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error generando PDF");
    } finally {
      setExporting(false);
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch(`/api/vra/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Informe aprobado");
      setReport({ ...report, status: "approved" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleTogglePortal = async () => {
    const newVal = !report.portalVisible;
    try {
      const res = await fetch(`/api/vra/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalVisible: newVal }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(newVal ? "Visible en portal cliente" : "Oculto del portal");
      setReport({ ...report, portalVisible: newVal });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleRegenerate = async (sectionId: string) => {
    setRegenerating(sectionId);
    try {
      const res = await fetch(`/api/vra/reports/${report.id}/sections/${sectionId}/regenerate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Sección regenerada");
      setReport({
        ...report,
        sections: report.sections.map((s) =>
          s.id === sectionId ? { ...s, ...json.section } : s,
        ),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 min-h-[calc(100vh-100px)]">
      {/* Sidebar — TOC */}
      <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
        <Link
          href={`/crm/installations/${report.installation.id}?tab=informes-vulnerabilidad`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a la instalación
        </Link>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Tabla de contenidos
          </div>
          <ul className="space-y-1">
            {report.sections
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((s) => (
                <li key={s.id}>
                  <button
                    className={cn(
                      "w-full text-left text-sm px-2 py-1.5 rounded-md flex items-start gap-2 hover:bg-muted",
                      activeSection === s.id && "bg-primary/10 text-primary font-medium",
                    )}
                    onClick={() => {
                      setActiveSection(s.id);
                      document
                        .getElementById(`vra-section-${s.id}`)
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className="font-mono text-xs text-primary min-w-[1.5rem]">
                      {numbering.get(s.id)}.
                    </span>
                    <span className="flex-1">{s.title}</span>
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      </aside>

      {/* Contenido principal */}
      <main className="space-y-6 min-w-0">
        {/* Header card */}
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge variant="default" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Generado con IA
                </Badge>
                <Badge variant="secondary">Versión {report.version}.0</Badge>
                {report.status === "approved" && (
                  <Badge className="bg-emerald-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Aprobado
                  </Badge>
                )}
                {report.riskLevel && (
                  <Badge className={cn("text-white", RISK_COLORS[report.riskLevel])}>
                    Riesgo {RISK_LABELS[report.riskLevel]}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {report.installation.name} · {report.installation.address}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleTogglePortal} className="gap-1.5">
                {report.portalVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {report.portalVisible ? "Ocultar portal" : "Mostrar portal"}
              </Button>
              {report.status !== "approved" && (
                <Button variant="outline" size="sm" onClick={handleApprove} className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprobar
                </Button>
              )}
              <Button onClick={handleExportPdf} disabled={exporting} className="gap-1.5">
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {exporting ? "Generando..." : "Exportar PDF"}
              </Button>
              {report.pdfUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={report.pdfUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir PDF
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Sections */}
        <div className="space-y-6">
          {report.sections
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => (
              <Card key={s.id} id={`vra-section-${s.id}`} className="p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-3">
                    <span className="font-mono text-sm text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {numbering.get(s.id)}
                    </span>
                    {s.title}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRegenerate(s.id)}
                    disabled={regenerating === s.id}
                    className="gap-1.5"
                    title="Regenerar esta sección con IA"
                  >
                    {regenerating === s.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerar
                  </Button>
                </div>
                {s.status === "error" ? (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm text-red-700 dark:text-red-300">
                    ⚠️ Error generando sección: {s.errorMessage}
                  </div>
                ) : s.status === "pending" || s.status === "generating" ? (
                  <div className="text-sm text-muted-foreground italic">Generando contenido...</div>
                ) : (
                  <SectionContentPreview content={s.contentJson} outputType={s.outputType} />
                )}
              </Card>
            ))}
        </div>
      </main>
    </div>
  );
}

function SectionContentPreview({
  content,
}: {
  content: unknown;
  outputType: string;
}) {
  if (!content) return <p className="text-muted-foreground italic">Sin contenido.</p>;
  const c = content as Record<string, unknown>;

  if (c.narrative) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {String(c.narrative)
          .split(/\n\n+/)
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
    );
  }
  if (Array.isArray(c.bullets)) {
    return (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {(c.bullets as string[]).map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60">
      {JSON.stringify(c, null, 2)}
    </pre>
  );
}
