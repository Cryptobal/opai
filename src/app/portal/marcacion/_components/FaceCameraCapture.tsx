"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XlButton } from "@/components/opai/terreno";
import type { XlButtonVariant } from "@/components/opai/terreno";

interface FaceCameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  onCancel: () => void;
  captureLabel?: string;
  /** @deprecated hex no longer used — kept so call sites compile */
  captureColor?: string;
  captureDisabled?: boolean;
  captureVariant?: XlButtonVariant;
}

const RING_SIZE = 268;
const RING_STROKE = 6;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export function FaceCameraCapture({
  onCapture,
  onCancel,
  captureLabel = "Capturar",
  captureDisabled = false,
  captureVariant = "teal",
}: FaceCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Start camera
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        setError("No se pudo acceder a la camara. Verifica los permisos.");
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the image (front camera)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    // Remove data URL prefix
    const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());

    onCapture(imageData);
  }, [onCapture]);

  // Auto-capture with countdown
  const startAutoCapture = useCallback(() => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        captureFrame();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [captureFrame]);

  function handleCancel() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  const progress = countdown === null ? (cameraReady ? 0.1 : 0) : (4 - countdown) / 3;
  const dashOffset = RING_C * (1 - progress);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="mb-4 text-center text-sm text-status-danger-fg">{error}</p>
        <XlButton variant="ghost" size="md" onClick={handleCancel}>
          Volver
        </XlButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg
          className="pointer-events-none absolute inset-0 -rotate-90"
          width={RING_SIZE}
          height={RING_SIZE}
          aria-hidden
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            className="stroke-ds-border-default"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_R}
            fill="none"
            className="stroke-primary"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={dashOffset}
          />
        </svg>

        <div className="relative h-[232px] w-[232px] overflow-hidden rounded-full bg-ds-surface-2">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            playsInline
            muted
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at center, transparent 42%, hsl(var(--background) / 0.72) 74%)",
            }}
          />
          <div className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-primary/40" />
          {cameraReady && countdown === null && (
            <div className="terreno-scanline pointer-events-none absolute inset-x-[16%] top-0 h-[55%] motion-reduce:hidden">
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            </div>
          )}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40">
              <span className="font-display text-6xl font-bold tabular-nums text-primary">
                {countdown}
              </span>
            </div>
          )}
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ds-border-default border-t-primary" />
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-sm text-ds-text-2">
        {cameraReady && countdown === null
          ? "Mira a la cámara"
          : countdown !== null
            ? "Capturando..."
            : "Iniciando cámara..."}
      </p>

      {cameraReady && countdown === null && (
        <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
          <XlButton
            variant={captureVariant}
            size="xl"
            onClick={startAutoCapture}
            disabled={captureDisabled}
            className="min-h-[88px] sm:min-h-[96px]"
          >
            {captureLabel}
          </XlButton>
          <XlButton variant="ghost" size="md" onClick={handleCancel}>
            Cancelar
          </XlButton>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
