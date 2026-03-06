"use client";

import React, { useState, useRef } from "react";
import { Camera, Loader2, AlertTriangle, Check, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatChileanPlate, validateChileanPlate } from "@/lib/access-control/utils";

interface Props {
  tenantId: string;
  onPlateDetected: (plate: string) => void;
}

export function VehiclePlateOCR({ tenantId, onPlateDetected }: Props) {
  const [processing, setProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [detectedPlate, setDetectedPlate] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [plateError, setPlateError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualPlate, setManualPlate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setPlateError(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setCapturedImage(base64);

        try {
          const res = await fetch("/api/access-control/ocr-plate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, tenantId }),
          });

          const json = await res.json();
          if (json.success && json.data.plate) {
            const formatted = formatChileanPlate(json.data.plate);
            setDetectedPlate(formatted);
            setConfidence(json.data.confidence);
            onPlateDetected(formatted);

            if (json.data.confidence < 0.8) {
              setPlateError("Confianza baja — verifica la patente");
            }
          } else {
            setPlateError(json.data?.error || "No se pudo leer la patente");
            setManualMode(true);
          }
        } catch {
          setPlateError("Error de conexión. Ingresa la patente manualmente.");
          setManualMode(true);
        } finally {
          setProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setProcessing(false);
      setManualMode(true);
    }

    // Reset input
    e.target.value = "";
  };

  const handleManualSubmit = () => {
    const result = validateChileanPlate(manualPlate);
    if (result.valid) {
      const formatted = formatChileanPlate(manualPlate);
      setDetectedPlate(formatted);
      onPlateDetected(formatted);
      setManualMode(false);
    } else {
      setPlateError("Formato de patente no reconocido");
    }
  };

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {!detectedPlate && !manualMode && (
        <Button
          onClick={handleCapture}
          disabled={processing}
          className="w-full h-12 bg-purple-600 hover:bg-purple-500"
        >
          {processing ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Camera className="mr-2 h-5 w-5" />
          )}
          {processing ? "Procesando..." : "Escanear Patente"}
        </Button>
      )}

      {detectedPlate && (
        <div className="flex items-center gap-3 rounded-md bg-zinc-800 p-3">
          <div className="flex-1">
            <p className="text-xs text-zinc-500">Patente detectada</p>
            <p className="text-xl font-bold text-zinc-100 tracking-wider">
              {detectedPlate}
            </p>
          </div>
          {confidence >= 0.8 ? (
            <Check className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          )}
          <button
            onClick={() => {
              setDetectedPlate(null);
              setManualMode(false);
              setPlateError(null);
            }}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {plateError && (
        <p className="text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {plateError}
        </p>
      )}

      {manualMode && !detectedPlate && (
        <div className="flex gap-2">
          <Input
            value={manualPlate}
            onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
            placeholder="ABCD-12"
            className="flex-1 bg-zinc-800 border-zinc-600 text-lg tracking-wider uppercase"
          />
          <Button onClick={handleManualSubmit} disabled={!manualPlate}>
            <Check className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!manualMode && !detectedPlate && !processing && (
        <button
          onClick={() => setManualMode(true)}
          className="text-xs text-zinc-500 hover:text-zinc-400"
        >
          Ingresar patente manualmente
        </button>
      )}
    </div>
  );
}
