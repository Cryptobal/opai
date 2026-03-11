"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface FaceCameraCaptureProps {
  onCapture: (imageBase64: string) => void;
  onCancel: () => void;
}

export function FaceCameraCapture({ onCapture, onCancel }: FaceCameraCaptureProps) {
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-red-400 text-sm text-center mb-4">{error}</p>
        <button
          onClick={handleCancel}
          className="rounded-xl px-6 py-2 text-sm text-white/70"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* Camera view */}
      <div className="relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden" style={{ background: "#111" }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
          playsInline
          muted
        />

        {/* Face guide overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-48 h-60 rounded-full"
            style={{
              border: "2px solid rgba(16,185,129,0.5)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
            }}
          />
        </div>

        {/* Countdown overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-6xl font-bold text-emerald-400">{countdown}</span>
          </div>
        )}

        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
          </div>
        )}
      </div>

      <p className="text-sm text-white/50 mt-3 text-center">
        {cameraReady && countdown === null
          ? "Mira directamente a la camara"
          : countdown !== null
            ? "Capturando..."
            : "Iniciando camara..."}
      </p>

      {/* Buttons */}
      {cameraReady && countdown === null && (
        <div className="flex gap-3 mt-4 w-full max-w-sm">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-medium text-white/70"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Cancelar
          </button>
          <button
            onClick={startAutoCapture}
            className="flex-1 rounded-xl px-4 py-3 text-sm font-bold text-white"
            style={{ background: "rgba(16,185,129,0.4)" }}
          >
            Capturar
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
