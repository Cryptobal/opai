"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type NoteSaveState = "idle" | "saving" | "saved" | "error";

/**
 * Autoguardado de nota: debounce 700 ms, flush en blur/cambio de celda,
 * deduplicación por contenido, conserva borrador ante error.
 */
export function useCellNoteAutosave(opts: {
  rowId: string;
  weekStart: string;
  initial: string;
  save: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  enabled?: boolean;
}) {
  const [draft, setDraft] = useState(opts.initial);
  const [state, setState] = useState<NoteSaveState>("idle");
  const persistedRef = useRef((opts.initial ?? "").trim());
  const draftRef = useRef(draft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef({ rowId: opts.rowId, weekStart: opts.weekStart });
  const saveRef = useRef(opts.save);
  saveRef.current = opts.save;
  draftRef.current = draft;

  const clearDebounce = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const doSave = useCallback(async (value: string, rowId: string, weekStart: string) => {
    const trimmed = value.trim();
    if (trimmed === persistedRef.current) {
      setState("idle");
      return true;
    }
    setState("saving");
    const ok = await saveRef.current(rowId, weekStart, trimmed || null);
    if (ok) {
      persistedRef.current = trimmed;
      setState("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setState("idle"), 1600);
    } else {
      setState("error");
    }
    return ok;
  }, []);

  useEffect(() => {
    const prev = keyRef.current;
    if (prev.rowId !== opts.rowId || prev.weekStart !== opts.weekStart) {
      clearDebounce();
      const v = draftRef.current;
      if (v.trim() !== persistedRef.current) {
        void saveRef.current(prev.rowId, prev.weekStart, v.trim() || null);
      }
      keyRef.current = { rowId: opts.rowId, weekStart: opts.weekStart };
      persistedRef.current = (opts.initial ?? "").trim();
      setDraft(opts.initial ?? "");
      setState("idle");
    }
  }, [opts.rowId, opts.weekStart, opts.initial]);

  const setDraftAndSchedule = useCallback((value: string) => {
    setDraft(value);
    draftRef.current = value;
    if (opts.enabled === false) return;
    clearDebounce();
    const { rowId, weekStart } = keyRef.current;
    timerRef.current = setTimeout(() => { void doSave(value, rowId, weekStart); }, 700);
  }, [doSave, opts.enabled]);

  const flush = useCallback(async () => {
    clearDebounce();
    const { rowId, weekStart } = keyRef.current;
    return doSave(draftRef.current, rowId, weekStart);
  }, [doSave]);

  const reset = useCallback((value: string) => {
    clearDebounce();
    persistedRef.current = value.trim();
    setDraft(value);
    draftRef.current = value;
    setState("idle");
  }, []);

  useEffect(() => () => {
    clearDebounce();
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    const v = draftRef.current;
    if (v.trim() !== persistedRef.current) {
      const { rowId, weekStart } = keyRef.current;
      void saveRef.current(rowId, weekStart, v.trim() || null);
    }
  }, []);

  return { draft, setDraft: setDraftAndSchedule, state, flush, reset, retry: () => void flush() };
}
