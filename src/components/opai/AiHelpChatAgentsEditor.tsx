"use client";

import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader, Surface } from "@/components/opai-ds";
import {
  AGENT_INSTRUCTIONS_MAX,
  AI_AGENT_MODULES,
  type AiAgentModule,
  type AiAgentProfile,
} from "@/lib/ai/help-chat-agents";

const MAX_INSTRUCTIONS = AGENT_INSTRUCTIONS_MAX;

const AGENT_LABELS: Record<AiAgentModule, string> = {
  global: "Global",
  comercial: "Comercial",
  operaciones: "Operaciones",
  finanzas: "Finanzas",
  payroll: "Payroll",
  personas: "Personas",
  documentos: "Documentos",
};

const AGENT_PLACEHOLDERS: Record<AiAgentModule, string> = {
  global:
    "Tono profesional y cercano. Prioriza respuestas accionables con el siguiente paso claro.",
  comercial:
    "Prioriza crear cotizaciones vía CPQ; en licitaciones sigue el flujo: resumen de bases → checklist con fechas → cotización borrador. Montos siempre CLP + UF.",
  operaciones:
    "Enfócate en cobertura, pautas y rondas. Propón acciones operativas concretas (reasignar, abrir ticket, revisar monitoreo).",
  finanzas:
    "Usa moneda y UF con precisión. Prioriza facturación, conciliación y flujo de caja con datos verificados.",
  payroll:
    "Sé cuidadoso con remuneraciones y datos sensibles. Explica parámetros y liquidaciones sin inventar montos.",
  personas:
    "Prioriza ficha de guardias, documentos y estado del colaborador. No expongas datos sensibles de más.",
  documentos:
    "Ayuda con plantillas, contratos y anexos. Resume documentos con partes, vigencia y obligaciones clave.",
};

export type AgentsState = Partial<Record<AiAgentModule, AiAgentProfile>>;

type Props = {
  agents: AgentsState;
  onChange: (agents: AgentsState) => void;
};

export function AiHelpChatAgentsEditor({ agents, onChange }: Props) {
  const update = (key: AiAgentModule, patch: Partial<AiAgentProfile>) => {
    const current = agents[key] ?? { enabled: true, instructions: "" };
    onChange({ ...agents, [key]: { ...current, ...patch } });
  };

  return (
    <section className="space-y-3 min-w-0">
      <SectionHeader
        size="sm"
        title="Agentes por módulo"
        hint="El agente Global aplica siempre. El del módulo se suma según la pantalla donde estés (CRM, Ops, etc.). No pueden anular seguridad ni RBAC."
      />
      <div className="space-y-3">
        {AI_AGENT_MODULES.map((key) => {
          const profile = agents[key] ?? { enabled: true, instructions: "" };
          const count = profile.instructions.length;
          return (
            <Surface key={key} elevation={1} padding="md" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-sm font-semibold text-ds-text-1">
                  {AGENT_LABELS[key]}
                </p>
                <Switch
                  checked={profile.enabled}
                  onCheckedChange={(v) => update(key, { enabled: v })}
                  aria-label={`Activar agente ${AGENT_LABELS[key]}`}
                />
              </div>
              <Textarea
                value={profile.instructions}
                maxLength={MAX_INSTRUCTIONS}
                placeholder={AGENT_PLACEHOLDERS[key]}
                onChange={(e) =>
                  update(key, {
                    instructions: e.target.value.slice(0, MAX_INSTRUCTIONS),
                  })
                }
                className="min-h-[100px] text-[13px] border-ds-border-default bg-ds-surface-1"
                disabled={!profile.enabled}
              />
              <p className="text-right text-[12px] font-mono text-ds-text-4">
                {count}/{MAX_INSTRUCTIONS}
              </p>
            </Surface>
          );
        })}
      </div>
    </section>
  );
}
