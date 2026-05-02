"use client";

import { useState } from "react";
import { AlertTriangle, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  mode?: "regular" | "vra";
};

const SECTOR_SUGGESTIONS = [
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Perimetral",
  "Interior",
  "Exterior",
  "Tecnología",
  "Acceso",
];

export function FindingModal({ visitId, guardId, onClose, onCreated, mode = "regular" }: Props) {
  const isVra = mode === "vra";
  const [category, setCategory] = useState<string>(isVra ? "infrastructure" : "personal");
  const [severity, setSeverity] = useState<string>(isVra ? "major" : "minor");
  const [description, setDescription] = useState("");
  // Campos VRA
  const [location, setLocation] = useState("");
  const [sectorTag, setSectorTag] = useState("");
  const [aggravatingFactors, setAggravatingFactors] = useState("");
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
          location: isVra ? location.trim() || null : null,
          sectorTag: isVra ? sectorTag.trim() || null : null,
          aggravatingFactors: isVra ? aggravatingFactors.trim() || null : null,
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
            {isVra ? (
              <ShieldAlert className="h-4 w-4 text-status-warn-fg" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-status-warn-fg" />
            )}
            {isVra ? "Registrar hallazgo de vulnerabilidad" : "Registrar hallazgo"}
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
                        ? "border-status-danger-border bg-status-danger-soft text-status-danger-fg"
                        : s.value === "major"
                          ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
                          : "border-status-info-border bg-status-info-soft text-status-info-fg"
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
              placeholder={
                isVra
                  ? "Ej: Perforación activa en muro perimetral oeste con técnica de erosión y golpe directo. Hay dos orificios visibles."
                  : "Describe el hallazgo encontrado..."
              }
              rows={3}
              className="text-sm"
            />
          </div>

          {isVra && (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3 text-status-warn-fg" />
                  Localización física
                </Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Pieza de bombas, Reja del acceso principal, Techo bodega norte..."
                  className="text-sm h-12"
                  list="vra-location-suggestions"
                />
                <datalist id="vra-location-suggestions">
                  <option value="Muro perimetral oeste" />
                  <option value="Reja del acceso principal" />
                  <option value="Caseta de vigilancia" />
                  <option value="Techo bodega central" />
                  <option value="Pieza de bombas" />
                  <option value="Patio de carga" />
                  <option value="Sector estacionamiento" />
                </datalist>
                <p className="text-[11px] text-muted-foreground">
                  Sé específico. La IA usa esta localización para situar el hallazgo en el mapa del informe.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Sector (etiqueta amplia)</Label>
                <Input
                  value={sectorTag}
                  onChange={(e) => setSectorTag(e.target.value)}
                  placeholder="Ej: Norte, Perimetral, Interior, Tecnología..."
                  className="text-sm h-12"
                  list="vra-sector-suggestions"
                />
                <datalist id="vra-sector-suggestions">
                  {SECTOR_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>Factores agravantes (opcional)</Label>
                <Textarea
                  value={aggravatingFactors}
                  onChange={(e) => setAggravatingFactors(e.target.value)}
                  placeholder="Ej: Sin iluminación nocturna y sin cobertura CCTV en este sector."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 p-2 text-sm text-status-danger-fg">{error}</p>
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
