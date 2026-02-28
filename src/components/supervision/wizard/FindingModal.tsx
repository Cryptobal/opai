"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Finding } from "./types";
import { FINDING_CATEGORIES, FINDING_SEVERITIES } from "./types";

type Props = {
  visitId: string;
  guardId: string | null;
  onClose: () => void;
  onCreated: (finding: Finding) => void;
};

export function FindingModal({ visitId, guardId, onClose, onCreated }: Props) {
  const [category, setCategory] = useState<string>("personal");
  const [severity, setSeverity] = useState<string>("minor");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!description.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/ops/supervision/${visitId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardId: guardId ?? null,
          category,
          severity,
          description: description.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo crear el hallazgo");
      }
      onCreated(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear hallazgo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-lg rounded-t-xl border bg-card p-4 shadow-xl sm:rounded-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Registrar hallazgo
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINDING_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Severidad</Label>
            <div className="flex gap-2">
              {FINDING_SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm font-medium transition-all ${
                    severity === s.value
                      ? s.value === "critical"
                        ? "border-red-500 bg-red-500/20 text-red-400"
                        : s.value === "major"
                          ? "border-amber-500 bg-amber-500/20 text-amber-400"
                          : "border-blue-500 bg-blue-500/20 text-blue-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el hallazgo encontrado..."
              rows={3}
              className="text-sm"
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1" size="lg">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !description.trim()}
              className="flex-1"
              size="lg"
            >
              {submitting ? "Guardando..." : "Crear hallazgo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
