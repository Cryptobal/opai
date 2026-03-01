"use client";

import { useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";

interface Props {
  onRecorded: (blob: Blob) => void;
  onClose: () => void;
  maxSeconds?: number;
}

export function AudioRecorder({ onRecorded, onClose, maxSeconds = 15 }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (chunksRef.current.length > 0) {
          onRecorded(new Blob(chunksRef.current, { type: "audio/webm" }));
        }
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev + 1 >= maxSeconds) {
            recorder.stop();
            setRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return maxSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setError("No se pudo acceder al micrófono");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="flex justify-end">
          <button onClick={onClose} className="p-2 rounded-lg bg-white/10 active:bg-white/20">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <div className={`h-20 w-20 rounded-full flex items-center justify-center ${recording ? "bg-red-500 animate-pulse" : "bg-white/10"}`}>
                <Mic className="h-8 w-8 text-white" />
              </div>
              <span className="text-2xl font-mono text-white">
                {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
              </span>
              <span className="text-[11px] text-white/40">Máximo {maxSeconds} segundos</span>
            </div>

            {recording ? (
              <button onClick={stop} className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500 active:scale-95">
                <Square className="h-6 w-6 text-white" />
              </button>
            ) : (
              <button onClick={start} className="h-12 w-full rounded-lg bg-emerald-500 text-sm font-semibold text-white active:scale-[0.98]">
                Grabar nota de voz
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
