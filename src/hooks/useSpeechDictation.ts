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

/**
 * Dictado en vivo (Web Speech API): mientras habla, el texto aparece en el
 * composer (interim + final), estilo Claude Code.
 */
export function useSpeechDictation(opts: {
  value: string;
  onChange: (next: string) => void;
  lang?: string;
  disabled?: boolean;
}) {
  const { value, onChange, lang = "es-CL", disabled } = opts;
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalChunkRef = useRef("");
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setSupported(isSpeechDictationSupported());
  }, []);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (disabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Tu navegador no soporta dictado por voz");
      return;
    }
    setError(null);
    stop();

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    baseTextRef.current = valueRef.current.trimEnd();
    finalChunkRef.current = "";

    rec.onresult = (ev) => {
      let interim = "";
      let finals = finalChunkRef.current;
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const piece = ev.results[i][0]?.transcript ?? "";
        if (ev.results[i].isFinal) {
          finals = `${finals}${piece}`;
          finalChunkRef.current = finals;
        } else {
          interim += piece;
        }
      }
      const prefix = baseTextRef.current;
      const joined = [prefix, `${finals}${interim}`.trim()].filter(Boolean).join(prefix ? " " : "");
      onChangeRef.current(joined);
    };

    rec.onerror = (ev) => {
      const code = ev.error ?? "error";
      if (code === "aborted" || code === "no-speech") return;
      setError(
        code === "not-allowed"
          ? "Permiso de micrófono denegado"
          : "No se pudo dictar. Intenta de nuevo.",
      );
      setListening(false);
      recognitionRef.current = null;
    };

    rec.onend = () => {
      // Si el usuario sigue en modo listening, algunos browsers cortan solos:
      // reiniciamos para mantener el dictado continuo.
      if (recognitionRef.current === rec) {
        try {
          rec.start();
          return;
        } catch {
          recognitionRef.current = null;
          setListening(false);
        }
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("No se pudo iniciar el micrófono");
      recognitionRef.current = null;
      setListening(false);
    }
  }, [disabled, lang, stop]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (disabled && listening) stop();
  }, [disabled, listening, stop]);

  return { supported, listening, error, start, stop, toggle };
}
