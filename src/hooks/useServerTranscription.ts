"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acquireUserMediaAudio,
  queryMicPermission,
} from "@/lib/mic-permission";

export type ServerTranscriptionState =
  | "idle"
  | "recording"
  | "uploading"
  | "done"
  | "error";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

/**
 * MediaRecorder → POST /api/ai/help-chat/transcribe.
 * Cancelación con AbortController; resultados tardíos se descartan.
 *
 * El mic SOLO se pide en `start()` (gesto del usuario). No hay getUserMedia
 * en mount ni en useEffect — eso re-prompteaba en PWA/iOS al abrir la app.
 */
export function useServerTranscription(opts?: {
  onText?: (text: string) => void;
}) {
  const [state, setState] = useState<ServerTranscriptionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(opts?.onText);
  const generationRef = useRef(0);
  /** Evita dos getUserMedia concurrentes (doble prompt en iOS). */
  const startingRef = useRef(false);

  useEffect(() => {
    onTextRef.current = opts?.onText;
  }, [opts?.onText]);

  const cleanupMedia = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (maxRef.current) {
      clearTimeout(maxRef.current);
      maxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMediaStream(null);
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    startingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      // noop
    }
    cleanupMedia();
    setState("idle");
    setError(null);
    setErrorCode(null);
    setElapsedMs(0);
  }, [cleanupMedia]);

  const upload = useCallback(async (blob: Blob, mime: string, gen: number) => {
    setState("uploading");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const fd = new FormData();
      const ext = mime.includes("mp4") ? "m4a" : "webm";
      fd.append("audio", blob, `dictado.${ext}`);
      const res = await fetch("/api/ai/help-chat/transcribe", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        code?: string;
        data?: { text?: string };
      };
      if (gen !== generationRef.current) return;
      if (!res.ok || !json.success || !json.data?.text) {
        const code = typeof json.code === "string" ? json.code : null;
        setErrorCode(code);
        // El controller maneja NO_TRANSCRIPTION_PROVIDER (fallback Web Speech).
        if (code === "NO_TRANSCRIPTION_PROVIDER") {
          setError(null);
          setState("error");
          return;
        }
        throw new Error(json.error || "No se pudo transcribir");
      }
      setErrorCode(null);
      onTextRef.current?.(json.data.text);
      setState("done");
      setElapsedMs(0);
    } catch (err) {
      if (gen !== generationRef.current) return;
      if ((err as Error)?.name === "AbortError") {
        setState("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Error de transcripción");
      setState("error");
    } finally {
      if (gen === generationRef.current) abortRef.current = null;
    }
  }, []);

  const stopAndUpload = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current || state === "recording" || state === "uploading") {
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Tu navegador no soporta grabación de audio");
      setState("error");
      return;
    }
    const mime = pickMimeType();
    if (!mime) {
      setError("Formato de audio no soportado");
      setState("error");
      return;
    }

    const perm = await queryMicPermission();
    if (perm === "denied") {
      setError(
        "Micrófono bloqueado. Actívalo en Ajustes del teléfono para esta app.",
      );
      setState("error");
      return;
    }

    // Sube generation sin abortar un stream que aún no existe (evita carrera).
    generationRef.current += 1;
    const gen = generationRef.current;
    startingRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    cleanupMedia();
    setError(null);
    setErrorCode(null);

    try {
      // Un solo getUserMedia por dictado; useAudioLevel reutiliza este stream.
      const stream = await acquireUserMediaAudio();
      if (gen !== generationRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setMediaStream(stream);
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        cleanupMedia();
        if (gen !== generationRef.current) return;
        void upload(blob, mime, gen);
      };
      rec.start(250);
      startedAtRef.current = Date.now();
      setState("recording");
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      maxRef.current = setTimeout(() => {
        stopAndUpload();
      }, 120_000);
    } catch {
      setError("Permiso de micrófono denegado");
      setState("error");
      cleanupMedia();
    } finally {
      if (gen === generationRef.current) startingRef.current = false;
    }
  }, [state, cleanupMedia, upload, stopAndUpload]);

  useEffect(() => () => cancel(), [cancel]);

  return {
    state,
    error,
    errorCode,
    elapsedMs,
    recording: state === "recording",
    uploading: state === "uploading",
    mediaStream,
    supported: typeof window !== "undefined" && typeof MediaRecorder !== "undefined",
    start,
    stop: stopAndUpload,
    cancel,
  };
}
