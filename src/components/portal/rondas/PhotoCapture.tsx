"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Props {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export function PhotoCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Revoke object URL on preview change / unmount
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return; // Don't start camera while showing preview
    let cancelled = false;
    setLoading(true);
    setError("");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* ignore - may unmount */ });
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          setError(
            err.name === "NotAllowedError"
              ? "Permiso de camara denegado"
              : "No se pudo acceder a la camara"
          );
        }
      });
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera, preview, cameraKey]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          blobRef.current = blob;
          setPreview(URL.createObjectURL(blob));
        }
      },
      "image/jpeg",
      0.8,
    );
    stopCamera();
  }, [stopCamera]);

  const confirm = useCallback(() => {
    if (blobRef.current) onCapture(blobRef.current);
  }, [onCapture]);

  const retake = useCallback(() => {
    blobRef.current = null;
    setPreview(null);
    setCameraKey(k => k + 1);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Captura de foto">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-lg font-semibold text-white">Foto Evidencia</h2>
        <button onClick={() => { stopCamera(); onClose(); }} className="rounded-lg bg-gray-800 px-4 py-2 text-base text-white">
          Cerrar
        </button>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {preview ? (
        <div className="flex flex-1 flex-col">
          <img src={preview} alt="Preview" className="flex-1 object-contain" />
          <div className="flex gap-3 px-4 py-4">
            <button onClick={retake} className="flex-1 rounded-xl bg-gray-700 py-4 text-lg text-white">
              Repetir
            </button>
            <button onClick={confirm} className="flex-1 rounded-xl bg-teal-600 py-4 text-lg font-semibold text-white">
              Usar Foto
            </button>
          </div>
        </div>
      ) : (
        <div className="relative flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-center text-lg text-red-400">{error}</p>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-lg text-white">Iniciando camara...</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-center pb-8">
                <button
                  onClick={capture}
                  aria-label="Tomar foto"
                  className="h-20 w-20 rounded-full border-4 border-white bg-white/20 active:bg-white/40"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
