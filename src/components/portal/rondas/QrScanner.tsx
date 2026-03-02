"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startScan() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Use BarcodeDetector if available
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const interval = setInterval(async () => {
            if (cancelled || !videoRef.current) { clearInterval(interval); return; }
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                clearInterval(interval);
                stopCamera();
                onScan(barcodes[0].rawValue);
              }
            } catch { /* ignore detection errors */ }
          }, 300);
          return () => clearInterval(interval);
        }
      } catch (err) {
        if (!cancelled) setError("No se pudo acceder a la cámara");
      }
    }

    startScan();
    return () => { cancelled = true; stopCamera(); };
  }, [onScan, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Escanear QR</h2>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="rounded-lg bg-gray-800 px-4 py-2 text-base text-white"
        >
          Cerrar
        </button>
      </div>
      {error ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="text-center text-lg text-red-400">{error}</p>
        </div>
      ) : (
        <div className="relative flex-1">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 rounded-2xl border-4 border-teal-500/50" />
          </div>
        </div>
      )}
    </div>
  );
}
