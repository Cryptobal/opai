"use client";

import { useMemo, useState } from "react";
import type { PublicItem } from "./types";
import PsychProgress from "./PsychProgress";
import PsychItemLikert from "./PsychItemLikert";
import PsychItemChoice from "./PsychItemChoice";
import PsychItemOpen from "./PsychItemOpen";

interface Props {
  items: PublicItem[];
  currentIndex: number;
  onAnswered: (
    itemId: string,
    value: unknown,
    latencyMs: number,
  ) => Promise<void>;
  onFinish: () => Promise<void>;
  primaryColor: string;
}

const OPEN_MIN_CHARS = 100;

export default function PsychRunning({
  items,
  currentIndex,
  onAnswered,
  onFinish,
  primaryColor,
}: Props) {
  const [renderStart] = useState(() => Date.now());
  const [likert, setLikert] = useState<number | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [openText, setOpenText] = useState("");
  const [busy, setBusy] = useState(false);

  const item = items[currentIndex];
  const isLast = useMemo(
    () => currentIndex === items.length - 1,
    [currentIndex, items.length],
  );

  if (!item) return null;

  const canContinue =
    (item.type === "LIKERT" || item.type === "LIE"
      ? likert !== null
      : item.type === "SJT" || item.type === "COGNITIVE"
        ? choice !== null
        : item.type === "OPEN"
          ? openText.trim().length >= OPEN_MIN_CHARS
          : false) && !busy;

  async function handleNext() {
    if (!canContinue) return;
    setBusy(true);
    try {
      const value =
        item.type === "LIKERT" || item.type === "LIE"
          ? likert
          : item.type === "SJT" || item.type === "COGNITIVE"
            ? choice
            : openText.trim();
      const latencyMs = Date.now() - renderStart;
      await onAnswered(item.id, value, latencyMs);
      setLikert(null);
      setChoice(null);
      setOpenText("");
      if (isLast) await onFinish();
    } catch (err) {
      console.error(err);
      alert("No pudimos guardar tu respuesta. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

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
            onSelect={setLikert}
            primaryColor={primaryColor}
          />
        ) : item.type === "SJT" || item.type === "COGNITIVE" ? (
          <PsychItemChoice
            item={item}
            selected={choice}
            onSelect={setChoice}
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
      <button
        className="w-full rounded-xl py-4 text-white text-base font-medium shadow-sm disabled:opacity-40 transition"
        style={{ background: primaryColor }}
        onClick={handleNext}
        disabled={!canContinue}
      >
        {isLast ? (busy ? "Enviando..." : "Enviar evaluación") : busy ? "Guardando..." : "Siguiente"}
      </button>
    </div>
  );
}
