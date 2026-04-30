"use client";

import { useRef, useState } from "react";
import { Camera, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = {
  visitId: string;
  finding: { id: string; description: string; severity: string };
  onClose: () => void;
  onResolved: (findingId: string) => void;
};

export function ResolveFindingModal({ visitId, finding, onClose, onResolved }: Props) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemovePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview(null);
  }

  async function handleSubmit() {
    if (!photoFile) {
      toast.error("Debes tomar una foto de prueba de resolución");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", photoFile);
      fd.append("categoryName", `Resolución hallazgo: ${finding.description.slice(0, 50)}`);
      const upRes = await fetch(`/api/ops/supervision/${visitId}/photos`, {
        method: "POST",
        body: fd,
      });
      const upJson = await upRes.json();
      if (!upRes.ok || !upJson.success) {
        throw new Error(upJson.error ?? "Error al subir foto");
      }
      const photoUrl = upJson.data.photoUrl;

      const resRes = await fetch(`/api/ops/supervision/findings/${finding.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutionPhotoUrl: photoUrl,
          verifiedInVisitId: visitId,
          note: note.trim() || undefined,
        }),
      });
      const resJson = await resRes.json();
      if (!resRes.ok || !resJson.success) {
        throw new Error(resJson.error ?? "Error al cerrar hallazgo");
      }
      toast.success("Hallazgo resuelto y ticket cerrado");
      onResolved(finding.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar hallazgo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-background p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Cerrar hallazgo
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3 rounded-lg border bg-muted/30 p-3 text-sm">
          {finding.description}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Foto de prueba (obligatoria)</label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCapture}
            />
            {photoPreview ? (
              <div className="relative mt-2 inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Resolución"
                  className="h-28 w-auto rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full"
                onClick={() => inputRef.current?.click()}
              >
                <Camera className="mr-2 h-4 w-4" /> Tomar foto
              </Button>
            )}
          </div>

          <div>
            <label className="text-xs font-medium">Nota (opcional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalle de la resolución..."
              rows={2}
              className="mt-1 text-sm"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={submitting || !photoFile}
            >
              {submitting ? "Cerrando..." : "Confirmar resolución"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
