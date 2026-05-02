"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicAnswer, PublicItem } from "./types";
import PsychProgress from "./PsychProgress";
import PsychItemLikert from "./PsychItemLikert";
import PsychItemChoice from "./PsychItemChoice";
import PsychItemOpen from "./PsychItemOpen";

interface Props {
  items: PublicItem[];
  currentIndex: number;
  responses: PublicAnswer[];
  onAnswered: (
    itemId: string,
    value: unknown,
    latencyMs: number,
  ) => Promise<void>;
  onBack: () => void;
  onFinish: () => Promise<void>;
  primaryColor: string;
}

const OPEN_MIN_CHARS = 100;
// Tiempo entre seleccionar una opción y avanzar automáticamente. Suficiente
// para que el usuario vea el highlight de la opción elegida y pueda corregir
// (clic en otra opción) o frenar el avance (clic en "Atrás") antes de saltar.
const AUTO_ADVANCE_MS = 350;

function readSavedValue(
  item: PublicItem,
  responses: PublicAnswer[],
): { likert: number | null; choice: string | null; openText: string } {
  const empty = { likert: null, choice: null, openText: "" };
  const saved = responses.find((r) => r.itemId === item.id);
  if (!saved) return empty;
  const raw = saved.value as unknown;
  const inner =
    typeof raw === "object" && raw !== null && "value" in raw
      ? (raw as { value: unknown }).value
      : raw;
  if (item.type === "LIKERT" || item.type === "LIE") {
    const n = Number(inner);
    return Number.isFinite(n) ? { ...empty, likert: n } : empty;
  }
  if (item.type === "SJT" || item.type === "COGNITIVE") {
    return typeof inner === "string" ? { ...empty, choice: inner } : empty;
  }
  if (item.type === "OPEN") {
    return typeof inner === "string" ? { ...empty, openText: inner } : empty;
  }
  return empty;
}

export default function PsychRunning({
  items,
  currentIndex,
  responses,
  onAnswered,
  onBack,
  onFinish,
  primaryColor,
}: Props) {
  const [renderStart, setRenderStart] = useState(() => Date.now());
  const [likert, setLikert] = useState<number | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [openText, setOpenText] = useState("");
  const [busy, setBusy] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const item = items[currentIndex];
  const isLast = useMemo(
    () => currentIndex === items.length - 1,
    [currentIndex, items.length],
  );

  // Al cambiar de pregunta: cancelar auto-advance pendiente, reset latencia,
  // y prefijar valor si ya fue respondida (caso "Atrás").
  useEffect(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setRenderStart(Date.now());
    if (!item) {
      setLikert(null);
      setChoice(null);
      setOpenText("");
      return;
    }
    const prefill = readSavedValue(item, responses);
    setLikert(prefill.likert);
    setChoice(prefill.choice);
    setOpenText(prefill.openText);
  }, [item, responses]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  if (!item) return null;

  async function submitValue(value: unknown) {
    if (busy || !item) return;
    setBusy(true);
    try {
      const latencyMs = Date.now() - renderStart;
      await onAnswered(item.id, value, latencyMs);
      if (isLast) await onFinish();
    } catch (err) {
      console.error(err);
      alert("No pudimos guardar tu respuesta. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  function scheduleAutoAdvance(value: unknown) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      void submitValue(value);
    }, AUTO_ADVANCE_MS);
  }

  function selectLikert(v: number) {
    setLikert(v);
    scheduleAutoAdvance(v);
  }

  function selectChoice(v: string) {
    setChoice(v);
    scheduleAutoAdvance(v);
  }

  function handleManualNext() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (item.type === "LIKERT" || item.type === "LIE") {
      if (likert !== null) void submitValue(likert);
    } else if (item.type === "SJT" || item.type === "COGNITIVE") {
      if (choice !== null) void submitValue(choice);
    } else if (item.type === "OPEN") {
      const text = openText.trim();
      if (text.length >= OPEN_MIN_CHARS) void submitValue(text);
    }
  }

  function handleBack() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    onBack();
  }

  const canContinue =
    (item.type === "LIKERT" || item.type === "LIE"
      ? likert !== null
      : item.type === "SJT" || item.type === "COGNITIVE"
        ? choice !== null
        : item.type === "OPEN"
          ? openText.trim().length >= OPEN_MIN_CHARS
          : false) && !busy;

  const isOpen = item.type === "OPEN";
  const showBack = currentIndex > 0;

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm p-5 md:p-8">
      <PsychProgress
        current={currentIndex + 1}
        total={items.length}
        primaryColor={primaryColor}
      />
      <div className="mb-6">
        {item.type === "LIKERT" || item.type === "LIE" ? (
          <PsychItemLikert
            item={item}
            selected={likert}
            onSelect={selectLikert}
            primaryColor={primaryColor}
          />
        ) : item.type === "SJT" || item.type === "COGNITIVE" ? (
          <PsychItemChoice
            item={item}
            selected={choice}
            onSelect={selectChoice}
            primaryColor={primaryColor}
          />
        ) : (
          <PsychItemOpen
            item={item}
            value={openText}
            onChange={setOpenText}
            minChars={OPEN_MIN_CHARS}
          />
        )}
      </div>
      <div className={showBack ? "flex gap-2" : ""}>
        {showBack ? (
          <button
            type="button"
            className="rounded-xl py-4 px-5 text-base font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
            onClick={handleBack}
            disabled={busy}
          >
            ← Atrás
          </button>
        ) : null}
        {/* Para preguntas tipo opción, el avance es automático tras seleccionar.
            Mostramos igual el botón "Siguiente" para que el usuario pueda
            forzarlo de inmediato sin esperar el delay. Para OPEN siempre
            requiere clic explícito porque el textarea no tiene auto-advance. */}
        <button
          type="button"
          className="flex-1 rounded-xl py-4 text-white text-base font-medium shadow-sm disabled:opacity-40 transition"
          style={{ background: primaryColor }}
          onClick={handleManualNext}
          disabled={!canContinue}
        >
          {isLast
            ? busy
              ? "Enviando..."
              : "Enviar evaluación"
            : busy
              ? "Guardando..."
              : isOpen
                ? "Siguiente"
                : "Siguiente →"}
        </button>
      </div>
    </div>
  );
}
