"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const MAX_MS = 120_000;
const SILENCE_MS = 8_000;
const MAX_RESTARTS = 3;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechDictationSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type SpeechDictationApi = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  silent: boolean;
  elapsedMs: number;
  interimText: string;
  finalText: string;
  start: () => void;
  cancel: () => void;
  finish: () => Promise<string>;
  finishAndSend: () => Promise<void>;
};

/**
 * Dictado en vivo (Web Speech API) con cancel / finish / finishAndSend.
 */
export function useSpeechDictation(opts: {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void | Promise<void>;
  lang?: string;
  disabled?: boolean;
}): SpeechDictationApi {
  const { value, onChange, onSubmit, lang = "es-CL", disabled } = opts;
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalChunkRef = useRef("");
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const valueRef = useRef(value);
  const listeningRef = useRef(false);
  const restartCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endWaitersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setSupported(isSpeechDictationSupported());
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const flushEndWaiters = useCallback(() => {
    const waiters = endWaitersRef.current;
    endWaitersRef.current = [];
    for (const w of waiters) w();
  }, []);

  const detach = useCallback(
    (mode: "stop" | "abort") => {
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          if (mode === "abort") rec.abort();
          else rec.stop();
        } catch {
          // noop
        }
        recognitionRef.current = null;
      }
      listeningRef.current = false;
      setListening(false);
      clearTimers();
      flushEndWaiters();
    },
    [clearTimers, flushEndWaiters],
  );

  const cancel = useCallback(() => {
    detach("abort");
    finalChunkRef.current = "";
    setInterimText("");
    setFinalText("");
    setSilent(false);
    setElapsedMs(0);
    onChangeRef.current(baseTextRef.current);
  }, [detach]);

  const finish = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (!listeningRef.current) {
        resolve(valueRef.current);
        return;
      }
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        setInterimText("");
        setSilent(false);
        setElapsedMs(0);
        resolve(valueRef.current);
      };
      endWaitersRef.current.push(settle);
      detach("stop");
      // Espera breve por el último interim → final (P3 / casos límite).
      setTimeout(settle, 400);
    });
  }, [detach]);

  const finishAndSend = useCallback(async () => {
    await finish();
    await onSubmitRef.current?.();
  }, [finish]);

  const start = useCallback(() => {
    if (disabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Tu navegador no soporta dictado por voz");
      return;
    }
    setError(null);
    setSilent(false);
    detach("abort");

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    baseTextRef.current = valueRef.current.trimEnd();
    finalChunkRef.current = "";
    restartCountRef.current = 0;
    startedAtRef.current = Date.now();
    lastResultAtRef.current = Date.now();
    setFinalText("");
    setInterimText("");
    setElapsedMs(0);

    const applyTranscript = (finals: string, interim: string) => {
      finalChunkRef.current = finals;
      setFinalText(finals);
      setInterimText(interim);
      const prefix = baseTextRef.current;
      const joined = [prefix, `${finals}${interim}`.trim()]
        .filter(Boolean)
        .join(prefix ? " " : "");
      onChangeRef.current(joined);
    };

    rec.onresult = (ev) => {
      lastResultAtRef.current = Date.now();
      setSilent(false);
      let interim = "";
      let finals = finalChunkRef.current;
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) {
          finals = `${finals}${piece}`;
        } else {
          interim += piece;
        }
      }
      applyTranscript(finals, interim);
    };

    rec.onerror = (ev) => {
      const code = ev.error ?? "error";
      if (code === "aborted" || code === "no-speech") return;
      setError(
        code === "not-allowed"
          ? "Permiso de micrófono denegado"
          : "No se pudo dictar. Intenta de nuevo.",
      );
      listeningRef.current = false;
      setListening(false);
      recognitionRef.current = null;
      clearTimers();
      flushEndWaiters();
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) {
        flushEndWaiters();
        return;
      }
      // Reinicio acotado para dictado continuo (máx. 3 en ventana del dictado).
      if (
        listeningRef.current &&
        restartCountRef.current < MAX_RESTARTS &&
        Date.now() - startedAtRef.current < MAX_MS
      ) {
        restartCountRef.current += 1;
        try {
          rec.start();
          return;
        } catch {
          // cae a stop
        }
      }
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      clearTimers();
      flushEndWaiters();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      listeningRef.current = true;
      setListening(true);
      maxTimerRef.current = setTimeout(() => {
        void finish();
      }, MAX_MS);
      tickTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (Date.now() - lastResultAtRef.current >= SILENCE_MS) {
          setSilent(true);
        }
      }, 250);
    } catch {
      setError("No se pudo iniciar el micrófono");
      recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
    }
  }, [disabled, lang, detach, clearTimers, flushEndWaiters, finish]);

  useEffect(() => () => detach("abort"), [detach]);

  useEffect(() => {
    if (disabled && listening) void finish();
  }, [disabled, listening, finish]);

  useEffect(() => {
    if (!listening) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") void finish();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [listening, finish]);

  return {
    supported,
    listening,
    error,
    silent,
    elapsedMs,
    interimText,
    finalText,
    start,
    cancel,
    finish,
    finishAndSend,
  };
}
