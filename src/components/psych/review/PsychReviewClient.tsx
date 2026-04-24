"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PsychReviewReport from "./PsychReviewReport";
import PsychReviewSignForm from "./PsychReviewSignForm";

interface Payload {
  success: boolean;
  tenant: { name: string };
  candidate: { name: string; rut: string | null };
  version: { code: string; version: string; name: string };
  reviewer: { email: string | null; license: string | null };
  alreadySigned: boolean;
  result: {
    globalScore: number;
    band: string;
    dimensionScores: Record<string, { score: number; itemCount: number }>;
    alerts: Array<{ message: string; severity: string }>;
    openAnalysis: unknown;
    lieScaleScore: number | null;
    straightLining: boolean;
  };
}

export default function PsychReviewClient({ token }: { token: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/psych-review/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j);
        else setErr(j.error ?? "Error");
      })
      .catch((e) => setErr(String(e)));
  }, [token]);

  async function handleSign(input: {
    reviewerName: string;
    reviewerLicense: string | null;
    reviewNote: string;
  }) {
    const res = await fetch(`/api/public/psych-review/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, accepted: true }),
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      throw new Error(j.error ?? "Error al firmar");
    }
    router.replace("/t/psych-review/thanks");
  }

  if (err) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <p className="text-sm text-muted-foreground">Cargando informe…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {data.tenant.name}
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
          Revisión profesional — {data.candidate.name}
        </h1>
        {data.candidate.rut ? (
          <p className="text-sm text-muted-foreground">
            RUT: {data.candidate.rut}
          </p>
        ) : null}
      </header>
      <PsychReviewReport result={data.result} />
      {data.alreadySigned ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          Este informe ya fue firmado. Gracias por tu revisión.
        </div>
      ) : (
        <PsychReviewSignForm
          defaultLicense={data.reviewer.license}
          onSubmit={handleSign}
        />
      )}
    </div>
  );
}
