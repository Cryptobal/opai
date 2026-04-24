"use client";

import { useEffect, useState } from "react";
import {
  DIMENSION_WEIGHT_FIELD,
  PSYCH_DIMENSION_LABELS,
  PSYCH_DIMENSIONS,
  type PsychDimension,
} from "@/lib/psych/constants";

interface ConfigShape {
  weightImpulse: number;
  weightFrustration: number;
  weightStability: number;
  weightStress: number;
  weightAttention: number;
  weightReasoning: number;
  weightIntegrity: number;
  weightResponsibility: number;
  thresholdFit: number;
  thresholdCaution: number;
  requirePsychReview: boolean;
  invitationTTLHours: number;
}

export default function PsychConfigForm() {
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/psych/config")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const c = j.config;
          setCfg({
            weightImpulse: c.weights.IMPULSE_CONTROL,
            weightFrustration: c.weights.FRUSTRATION_TOLERANCE,
            weightStability: c.weights.EMOTIONAL_STABILITY,
            weightStress: c.weights.STRESS_MANAGEMENT,
            weightAttention: c.weights.SUSTAINED_ATTENTION,
            weightReasoning: c.weights.REASONING,
            weightIntegrity: c.weights.INTEGRITY,
            weightResponsibility: c.weights.RESPONSIBILITY,
            thresholdFit: c.thresholdFit,
            thresholdCaution: c.thresholdCaution,
            requirePsychReview: c.requirePsychReview,
            invitationTTLHours: c.invitationTTLHours,
          });
        }
      });
  }, []);

  if (!cfg) return <p className="text-muted-foreground">Cargando…</p>;

  async function handleSave() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/psych/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Error");
      setMsg("Configuración guardada");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function setWeight(dim: PsychDimension, v: number) {
    const field = DIMENSION_WEIGHT_FIELD[dim];
    setCfg((c) => (c ? { ...c, [field]: v } : c));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-semibold text-foreground mb-4">Pesos por dimensión</h3>
        <div className="space-y-3">
          {PSYCH_DIMENSIONS.map((dim) => {
            const field = DIMENSION_WEIGHT_FIELD[dim];
            const value = cfg[field] as number;
            return (
              <div key={dim} className="grid grid-cols-[1fr_120px_60px] gap-3 items-center">
                <label className="text-sm text-foreground/90">{PSYCH_DIMENSION_LABELS[dim]}</label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={value}
                  onChange={(e) => setWeight(dim, Number(e.target.value))}
                />
                <span className="text-sm text-foreground/90 text-right">{value.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h3 className="font-semibold text-foreground">Umbrales y políticas</h3>
        <NumRow label="Umbral apto (score ≥)" value={cfg.thresholdFit} min={40} max={100} onChange={(v) => setCfg({ ...cfg, thresholdFit: v })} />
        <NumRow label="Umbral con observación (score ≥)" value={cfg.thresholdCaution} min={20} max={99} onChange={(v) => setCfg({ ...cfg, thresholdCaution: v })} />
        <NumRow label="Expiración del enlace (horas)" value={cfg.invitationTTLHours} min={1} max={720} onChange={(v) => setCfg({ ...cfg, invitationTTLHours: v })} />
        <label className="flex items-center gap-2 text-sm text-foreground/90">
          <input type="checkbox" checked={cfg.requirePsychReview} onChange={(e) => setCfg({ ...cfg, requirePsychReview: e.target.checked })} />
          Requerir revisión de psicólogo antes de publicar banda final.
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </div>
  );
}

function NumRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm text-foreground/90">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-border px-2 py-1" />
    </label>
  );
}
