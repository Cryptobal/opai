"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CamaraFormSteps } from "./CamaraFormSteps";
import { EMPTY_FORM, formFromCamera, payloadFromForm, type CamaraFormState } from "./form-state";
import type { CamaraDto } from "./types";

const STEPS = ["Tipo", "Marca", "Conexión", "Probar", "Confirmar"];

type Props = {
  open: boolean;
  installationId: string;
  camera?: CamaraDto | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CamaraFormDialog({ open, installationId, camera, onClose, onSaved }: Props) {
  const [step, setStep] = useState(camera ? 2 : 0);
  const [form, setForm] = useState<CamaraFormState>(camera ? formFromCamera(camera) : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(camera ? 2 : 0);
    setForm(camera ? formFromCamera(camera) : EMPTY_FORM);
    setSnapshot(null);
    setError(null);
  }, [open, camera]);

  const patch = (p: Partial<CamaraFormState>) => setForm((f) => ({ ...f, ...p }));

  const persist = async (): Promise<string | null> => {
    setSaving(true);
    setError(null);
    const body = { ...payloadFromForm(form), installationId };
    if (!form.id && !form.password) {
      setSaving(false);
      setError("La clave es obligatoria");
      return null;
    }
    const url = form.id ? `/api/ops/camaras/${form.id}` : "/api/ops/camaras";
    const res = await fetch(url, {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "No se pudo guardar");
      return null;
    }
    const id = json.camera?.id as string | undefined;
    if (id) setForm((f) => ({ ...f, id, password: "" }));
    return id ?? form.id ?? null;
  };

  const test = async () => {
    const id = form.id ?? (await persist());
    if (!id) return;
    setTesting(true);
    setError(null);
    const res = await fetch(`/api/ops/camaras/${id}/test`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) {
      setError(typeof json.error === "string" ? json.error : "Fallo al probar");
      return;
    }
    setSnapshot(json.dataUrl ?? null);
  };

  const confirm = async () => {
    const id = form.id ?? (await persist());
    if (!id) return;
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg border-ds-border-default bg-ds-surface-1">
        <DialogHeader>
          <DialogTitle className="font-display">{camera ? "Editar cámara" : "Agregar cámara"}</DialogTitle>
          <p className="text-[13px] text-ds-text-3">{STEPS[step]}</p>
        </DialogHeader>
        <CamaraFormSteps
          step={step}
          form={form}
          onChange={patch}
          snapshot={snapshot}
          testing={testing}
          onTest={() => void test()}
          testError={error}
        />
        {error && step !== 3 && <p className="text-[13px] text-status-danger-fg">{error}</p>}
        <DialogFooter className="gap-2">
          {step > 0 && (
            <Button type="button" variant="ghost" className="h-10 sm:h-9" onClick={() => setStep((s) => s - 1)}>
              Atrás
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" className="h-10 sm:h-9" onClick={() => setStep((s) => s + 1)} disabled={saving}>
              Siguiente
            </Button>
          ) : (
            <Button type="button" className="h-10 sm:h-9" onClick={() => void confirm()} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
