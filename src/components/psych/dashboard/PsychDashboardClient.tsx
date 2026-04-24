"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PsychMetricsCards from "./PsychMetricsCards";
import PsychAssessmentsTable from "./PsychAssessmentsTable";

interface Dashboard {
  metrics: {
    statusCounts: Record<string, number>;
    bandCounts: Record<string, number>;
    averageScore: number;
  };
  recent: Array<{
    id: string;
    targetName: string;
    targetRut: string | null;
    status: string;
    createdAt: string;
    result: { globalScore: number; band: string } | null;
  }>;
}

interface ListPayload {
  total: number;
  rows: Array<{
    id: string;
    targetName: string;
    targetRut: string | null;
    status: string;
    createdAt: string;
    result: { globalScore: number; band: string } | null;
  }>;
}

export default function PsychDashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [list, setList] = useState<ListPayload | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/psych/dashboard").then((r) => r.json()),
      fetch("/api/psych/assessments").then((r) => r.json()),
    ])
      .then(([d, l]) => {
        if (d.success) setData(d);
        if (l.success) setList(l);
      })
      .catch(console.error);
  }, []);

  if (!data || !list) {
    return <div className="text-muted-foreground">Cargando…</div>;
  }

  const totalEvaluated = Object.values(data.metrics.statusCounts).reduce(
    (a, b) => a + b,
    0,
  );
  const fit = data.metrics.bandCounts["FIT"] ?? 0;
  const caution = data.metrics.bandCounts["FIT_CAUTION"] ?? 0;
  const notRec = data.metrics.bandCounts["NOT_RECOMMENDED"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Link
          href="/personas/psicolaboral/configuracion"
          className="text-sm rounded-lg border border-border px-3 py-2 text-foreground/90"
        >
          Configuración
        </Link>
        <Link
          href="/personas/psicolaboral/nuevo"
          className="text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2"
        >
          Nueva evaluación
        </Link>
      </div>
      <PsychMetricsCards
        total={totalEvaluated}
        fit={fit}
        caution={caution}
        notRec={notRec}
        average={data.metrics.averageScore}
      />
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Evaluaciones ({list.total})
        </h2>
        <PsychAssessmentsTable rows={list.rows} />
      </div>
    </div>
  );
}
