"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PhotoCategory, CapturedPhoto, VisitData } from "./types";

type Props = {
  visit: VisitData;
  photoCategories: PhotoCategory[];
  capturedPhotos: CapturedPhoto[];
  onPhotoCapture: (photo: CapturedPhoto) => void;
  onPhotoRemove: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  saving: boolean;
};

async function compressImage(file: File, maxSizeKB: number = 800): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.8;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size > maxSizeKB * 1024 && quality > 0.3) {
              quality -= 0.1;
              tryCompress();
            } else {
              const compressed = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressed);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      tryCompress();
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

export function Step4Evidence({
  visit,
  photoCategories,
  capturedPhotos,
  onPhotoCapture,
  onPhotoRemove,
  onNext,
  onPrev,
  saving,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeCategoryName, setActiveCategoryName] = useState<string>("");

  const mandatory = photoCategories.filter((c) => c.isMandatory);
  const optional = photoCategories.filter((c) => !c.isMandatory);

  function getPhotosForCategory(categoryId: string): CapturedPhoto[] {
    return capturedPhotos.filter((p) => p.categoryId === categoryId);
  }

  const mandatoryFulfilled = mandatory.every(
    (c) => getPhotosForCategory(c.id).length > 0,
  );
  const totalMandatory = mandatory.length;
  const fulfilledMandatory = mandatory.filter(
    (c) => getPhotosForCategory(c.id).length > 0,
  ).length;

  function handleCaptureClick(categoryId: string, categoryName: string) {
    setActiveCategoryId(categoryId);
    setActiveCategoryName(categoryName);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const compressed = await compressImage(file);
      const previewUrl = URL.createObjectURL(compressed);
      onPhotoCapture({
        categoryId: activeCategoryId,
        categoryName: activeCategoryName,
        file: compressed,
        previewUrl,
        uploaded: false,
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4 text-primary" />
          Evidencia
          <Badge variant="outline" className="ml-auto text-xs">
            Paso 4/5
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Mandatory photos */}
        {mandatory.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Fotos requeridas</p>
            <div className="space-y-2">
              {mandatory.map((cat) => {
                const photos = getPhotosForCategory(cat.id);
                const hasPhoto = photos.length > 0;
                return (
                  <div key={cat.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{cat.name}</p>
                        <p className="text-[10px] text-amber-400">obligatorio</p>
                      </div>
                      {hasPhoto ? (
                        <Badge variant="success" className="text-[10px]">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {photos.length} foto(s)
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          pendiente
                        </Badge>
                      )}
                    </div>

                    {/* Thumbnails */}
                    {photos.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {photos.map((photo, idx) => {
                          const globalIdx = capturedPhotos.indexOf(photo);
                          return (
                            <div key={idx} className="relative flex-shrink-0">
                              <img
                                src={photo.previewUrl}
                                alt={cat.name}
                                className="h-16 w-16 rounded-md object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => onPhotoRemove(globalIdx)}
                                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => handleCaptureClick(cat.id, cat.name)}
                    >
                      <Camera className="mr-2 h-3 w-3" />
                      Tomar foto
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional photos */}
        {optional.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Fotos opcionales</p>
            <div className="space-y-2">
              {optional.map((cat) => {
                const photos = getPhotosForCategory(cat.id);
                return (
                  <div key={cat.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">{cat.name}</p>
                      {photos.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {photos.length} foto(s)
                        </Badge>
                      )}
                    </div>

                    {photos.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {photos.map((photo, idx) => {
                          const globalIdx = capturedPhotos.indexOf(photo);
                          return (
                            <div key={idx} className="relative flex-shrink-0">
                              <img
                                src={photo.previewUrl}
                                alt={cat.name}
                                className="h-16 w-16 rounded-md object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => onPhotoRemove(globalIdx)}
                                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => handleCaptureClick(cat.id, cat.name)}
                    >
                      <Camera className="mr-2 h-3 w-3" />
                      Tomar foto
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4" />
            Total: {capturedPhotos.length} fotos
            {totalMandatory > 0 && (
              <span className={fulfilledMandatory === totalMandatory ? "text-emerald-400" : "text-amber-400"}>
                ({fulfilledMandatory}/{totalMandatory} obligatorias
                {fulfilledMandatory === totalMandatory ? " ✓" : ""})
              </span>
            )}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onPrev} className="flex-1" size="lg">
            ← Anterior
          </Button>
          <Button
            onClick={onNext}
            disabled={saving || (totalMandatory > 0 && !mandatoryFulfilled)}
            className="flex-1"
            size="lg"
          >
            {saving ? "Guardando..." : "Siguiente →"}
          </Button>
        </div>

        {totalMandatory > 0 && !mandatoryFulfilled && (
          <p className="text-center text-xs text-amber-400">
            Faltan {totalMandatory - fulfilledMandatory} foto(s) obligatoria(s)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
