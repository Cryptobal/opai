"use client";

import React, { useState, useRef } from "react";
import { Camera, Loader2, AlertTriangle, Check, RotateCw, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MrzOcrResult } from "@/lib/access-control/types";

interface Props {
  onResult: (data: { fullName: string; rut?: string }) => void;
  onSkip: () => void;
  existingRut?: string;
}

export function MrzCameraCapture({ onResult, onSkip, existingRut }: Props) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile =
    typeof navigator !== "undefined" && /Mobi|Android/i.test(navigator.userAgent);

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setCapturedImage(base64);

        try {
          const res = await fetch("/api/access-control/ocr-mrz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64 }),
          });

          const json = await res.json();
          if (json.success && json.data) {
            const data = json.data as MrzOcrResult;
            if (data.fullName) {
              onResult({
                fullName: data.fullName,
                rut: data.rut || existingRut || undefined,
              });
            } else {
              setError(data.error || "No se pudo leer el nombre del MRZ");
            }
          } else {
            setError(json.error || "Error al procesar imagen");
          }
        } catch {
          setError("Error de conexión. Ingresa el nombre manualmente.");
        } finally {
          setProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setProcessing(false);
      setError("Error al capturar la imagen");
    }

    e.target.value = "";
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setError(null);
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        {...(isMobile ? { capture: "environment" } : {})}
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-start gap-3">
        <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-300">
            Cédula antigua detectada
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            El QR no incluye el nombre. Fotografía el reverso de la cédula
            para leer el nombre desde el texto MRZ (las 3 líneas de la parte
            inferior).
          </p>
        </div>
        <button onClick={onSkip} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {capturedImage && !processing && !error && (
        <div className="relative rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedImage}
            alt="Cédula capturada"
            className="w-full h-32 object-cover opacity-40"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
          </div>
        </div>
      )}

      {!capturedImage && !error && (
        <Button
          onClick={handleCapture}
          disabled={processing}
          className="w-full h-12 bg-amber-600 hover:bg-amber-500 text-white"
        >
          {processing ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Camera className="mr-2 h-5 w-5" />
          )}
          {processing ? "Leyendo MRZ..." : "Fotografiar Cédula"}
        </Button>
      )}

      {processing && capturedImage && (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Leyendo nombre desde el MRZ...
        </div>
      )}

      {error && (
        <div className="space-y-2">
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {error}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="flex-1"
            >
              <RotateCw className="mr-1 h-3 w-3" />
              Reintentar
            </Button>
            <Button variant="outline" size="sm" onClick={onSkip} className="flex-1">
              Ingresar manual
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
