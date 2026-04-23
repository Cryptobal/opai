"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicPayload, WizardStage } from "./types";
import { psychApi } from "./usePsychApi";
import PsychWelcome from "./PsychWelcome";
import PsychConsent from "./PsychConsent";
import PsychInstructions from "./PsychInstructions";
import PsychRunning from "./PsychRunning";
import PsychStatusCard from "./PsychStatusCard";

interface Props {
  token: string;
}

const ESTIMATED_MIN = 25;
const DEFAULT_COLOR = "#0f172a";

export default function PsychWizard({ token }: Props) {
  const router = useRouter();
  const api = useMemo(() => psychApi(token), [token]);
  const [stage, setStage] = useState<WizardStage>("LOADING");
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    api
      .load()
      .then((data) => {
        const { assessment, version, responses, branding } = data;
        setPayload({ assessment, version, responses, branding });
        const answered = new Set(responses.map((r) => r.itemId));
        let nextIdx = 0;
        for (let i = 0; i < version.items.length; i += 1) {
          if (!answered.has(version.items[i].id)) {
            nextIdx = i;
            break;
          }
          nextIdx = i + 1;
        }
        setCurrentIndex(nextIdx);
        if (!assessment.consentAcceptedAt) setStage("WELCOME");
        else if (nextIdx >= version.items.length) setStage("SUBMITTING");
        else setStage("RUNNING");
      })
      .catch((err) => {
        setErrMsg(err instanceof Error ? err.message : String(err));
        setStage("ERROR");
      });
  }, [api]);

  const color = payload?.branding.primaryColor ?? DEFAULT_COLOR;

  async function handleConsent() {
    const tz = new Date().getTimezoneOffset() * -1;
    await api.consent({
      tzOffsetMinutes: tz,
      locale:
        typeof navigator !== "undefined" ? navigator.language : undefined,
    });
    await api.start().catch(() => void 0);
    setStage("INSTRUCTIONS");
  }

  async function handleAnswered(
    itemId: string,
    value: unknown,
    latencyMs: number,
  ) {
    await api.respond(itemId, value, latencyMs);
    setCurrentIndex((i) => i + 1);
  }

  async function handleFinish() {
    setStage("SUBMITTING");
    try {
      const res = await api.submit();
      router.replace(res.thanksPage ?? "/t/psicotest/thanks");
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
      setStage("ERROR");
    }
  }

  if (stage === "LOADING") {
    return <PsychStatusCard message="Cargando evaluación…" />;
  }
  if (stage === "ERROR" || !payload) {
    return (
      <PsychStatusCard
        icon="⚠️"
        message={errMsg ?? "No pudimos cargar la evaluación."}
        action={{ label: "Reintentar", onClick: () => location.reload() }}
      />
    );
  }

  return (
    <div className="py-6 md:py-12 px-4">
      {stage === "WELCOME" && (
        <PsychWelcome
          assessment={payload.assessment}
          version={payload.version}
          branding={payload.branding}
          estimatedMinutes={ESTIMATED_MIN}
          onContinue={() => setStage("CONSENT")}
        />
      )}
      {stage === "CONSENT" && (
        <PsychConsent primaryColor={color} onAccept={handleConsent} />
      )}
      {stage === "INSTRUCTIONS" && (
        <PsychInstructions
          totalItems={payload.version.items.length}
          estimatedMinutes={ESTIMATED_MIN}
          primaryColor={color}
          onContinue={() => setStage("RUNNING")}
        />
      )}
      {stage === "RUNNING" && (
        <PsychRunning
          items={payload.version.items}
          currentIndex={currentIndex}
          onAnswered={handleAnswered}
          onFinish={handleFinish}
          primaryColor={color}
        />
      )}
      {stage === "SUBMITTING" && (
        <PsychStatusCard icon="📤" message="Enviando tu evaluación…" />
      )}
    </div>
  );
}
