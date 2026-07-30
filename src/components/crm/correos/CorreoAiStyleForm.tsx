"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  DEFAULT_CORREO_AI_STYLE,
  type CorreoAiAddressing,
  type CorreoAiCloseness,
  type CorreoAiLength,
  type CorreoAiStyle,
} from "@/modules/crm/email/correo-ai-style";

function previewText(style: CorreoAiStyle): string {
  const greet =
    style.addressing === "usted"
      ? "Estimado señor Pérez,"
      : style.addressing === "tu"
        ? "Hola Juan,"
        : "Hola Juan,";
  const body =
    style.closeness === "formal"
      ? "Recibimos su consulta y la estamos revisando con detenimiento."
      : style.closeness === "directo"
        ? "Recibí tu consulta. Te confirmo disponibilidad y te paso la propuesta."
        : "Gracias por escribirnos. Revisé tu consulta y te cuento cómo seguimos.";
  const close =
    style.length === "breve"
      ? "Quedo atento."
      : style.length === "detallada"
        ? "Si te parece, coordinamos una llamada esta semana para alinear alcance, plazos y próximos pasos. Quedo atento a lo que necesites."
        : "¿Te parece si avanzamos con una propuesta esta semana?";
  return `${greet}\n\n${body}\n\n${close}`;
}

type Props = { active: boolean };

/**
 * Cuerpo del formulario de estilo IA (extraído del sheet sin cambios funcionales).
 */
export function CorreoAiStyleForm({ active }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usePersonal, setUsePersonal] = useState(false);
  const [canEditTenant, setCanEditTenant] = useState(false);
  const [tenantStyle, setTenantStyle] = useState<CorreoAiStyle>(DEFAULT_CORREO_AI_STYLE);
  const [personalStyle, setPersonalStyle] = useState<CorreoAiStyle | null>(null);
  const [draft, setDraft] = useState<CorreoAiStyle>(DEFAULT_CORREO_AI_STYLE);
  const [avoidInput, setAvoidInput] = useState("");

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch("/api/crm/correos/ai-style?scope=tenant").then((r) => r.json()),
      fetch("/api/crm/correos/ai-style?scope=user").then((r) => r.json()),
    ])
      .then(([tenant, user]) => {
        if (!alive) return;
        const tStyle = (tenant.style as CorreoAiStyle) ?? DEFAULT_CORREO_AI_STYLE;
        const pStyle = user.style as CorreoAiStyle | null;
        setTenantStyle(tStyle);
        setPersonalStyle(pStyle);
        setCanEditTenant(Boolean(tenant.canEditTenant));
        const personal = Boolean(user.hasPersonal && pStyle);
        setUsePersonal(personal);
        setDraft(personal && pStyle ? pStyle : tStyle);
        setAvoidInput(
          (personal && pStyle ? pStyle.avoidWords : tStyle.avoidWords).join(", "),
        );
      })
      .catch(() => {
        if (alive) toast.error("No se pudo cargar el estilo de respuesta");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [active]);

  const readOnly = !usePersonal && !canEditTenant;
  const scope: "user" | "tenant" = usePersonal ? "user" : "tenant";

  function patch(partial: Partial<CorreoAiStyle>) {
    if (readOnly) return;
    setDraft((d) => ({ ...d, ...partial }));
  }

  async function save() {
    const avoidWords = avoidInput
      .split(/[,;\n]/)
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 30)
      .map((w) => w.slice(0, 40));
    const payload: CorreoAiStyle = {
      ...draft,
      avoidWords,
      guidance: draft.guidance?.trim() ? draft.guidance.trim().slice(0, 1200) : null,
    };
    setSaving(true);
    try {
      const r = await fetch("/api/crm/correos/ai-style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, style: payload }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "No se pudo guardar");
        return;
      }
      setDraft(d.style ?? payload);
      if (scope === "tenant") setTenantStyle(d.style ?? payload);
      else setPersonalStyle(d.style ?? payload);
      toast.success("Estilo de respuesta guardado");
    } catch {
      toast.error("Sin conexión — no se guardó el estilo");
    } finally {
      setSaving(false);
    }
  }

  async function restoreCompany() {
    setSaving(true);
    try {
      const r = await fetch("/api/crm/correos/ai-style?scope=user", { method: "DELETE" });
      if (!r.ok) {
        toast.error("No se pudo restaurar");
        return;
      }
      setUsePersonal(false);
      setPersonalStyle(null);
      setDraft(tenantStyle);
      setAvoidInput(tenantStyle.avoidWords.join(", "));
      toast.success("Se restauraron los valores de la empresa");
    } catch {
      toast.error("Sin conexión");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <p className="text-[12px] text-ds-text-3">
        Define cómo escribe la IA al generar o refinar borradores. La firma
        se anexa al enviar desde la pestaña Firma.
      </p>

      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3">
        <label htmlFor="correo-ai-style-personal" className="min-w-0 flex-1 text-ds-body text-ds-text-2">
          Usar mi propio estilo
        </label>
        <input
          id="correo-ai-style-personal"
          type="checkbox"
          checked={usePersonal}
          onChange={(e) => {
            const on = e.target.checked;
            setUsePersonal(on);
            if (on) {
              const base = personalStyle ?? tenantStyle;
              setDraft(base);
              setAvoidInput(base.avoidWords.join(", "));
            } else {
              setDraft(tenantStyle);
              setAvoidInput(tenantStyle.avoidWords.join(", "));
            }
          }}
          className="h-5 w-5 shrink-0 rounded border-ds-border-default accent-primary"
        />
      </div>

      {readOnly && (
        <p className="rounded-lg bg-ds-surface-2 px-3 py-2 text-[12px] text-ds-text-3">
          Estás viendo el estilo de la empresa (solo lectura). Activá «Usar
          mi propio estilo» para personalizarlo, o pedí a un admin que lo
          edite.
        </p>
      )}

      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
        <span className="text-ds-body text-ds-text-2">Cercanía</span>
        <SimpleSelect
          value={draft.closeness}
          onValueChange={(v) => patch({ closeness: v as CorreoAiCloseness })}
          disabled={readOnly}
          aria-label="Cercanía"
          className="h-11 min-w-0 max-w-[9rem] border-0 bg-transparent"
          contentClassName="z-[80]"
          options={[
            { value: "formal", label: "Formal" },
            { value: "cercano", label: "Cercano" },
            { value: "directo", label: "Directo" },
          ]}
        />
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
        <span className="text-ds-body text-ds-text-2">Tratamiento</span>
        <SimpleSelect
          value={draft.addressing}
          onValueChange={(v) => patch({ addressing: v as CorreoAiAddressing })}
          disabled={readOnly}
          aria-label="Tratamiento"
          className="h-11 min-w-0 max-w-[9rem] border-0 bg-transparent"
          contentClassName="z-[80]"
          options={[
            { value: "nombre", label: "Nombre" },
            { value: "usted", label: "Usted" },
            { value: "tu", label: "Tú" },
          ]}
        />
      </div>

      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 pl-3 pr-2">
        <span className="text-ds-body text-ds-text-2">Extensión</span>
        <SimpleSelect
          value={draft.length}
          onValueChange={(v) => patch({ length: v as CorreoAiLength })}
          disabled={readOnly}
          aria-label="Extensión"
          className="h-11 min-w-0 max-w-[9rem] border-0 bg-transparent"
          contentClassName="z-[80]"
          options={[
            { value: "breve", label: "Breve" },
            { value: "media", label: "Media" },
            { value: "detallada", label: "Detallada" },
          ]}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-[12px] text-ds-text-3">Palabras a evitar</span>
        <input
          value={avoidInput}
          onChange={(e) => setAvoidInput(e.target.value)}
          disabled={readOnly}
          placeholder="Estimado, Cordialmente…"
          className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 outline-none focus:border-ds-border-strong disabled:opacity-60"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[12px] text-ds-text-3">Indicaciones libres</span>
        <textarea
          value={draft.guidance ?? ""}
          onChange={(e) => patch({ guidance: e.target.value.slice(0, 1200) })}
          disabled={readOnly}
          rows={3}
          maxLength={1200}
          placeholder="Ej. Siempre ofrecer una llamada de 15 min…"
          className="w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-ds-body text-ds-text-1 outline-none focus:border-ds-border-strong disabled:opacity-60"
        />
      </label>

      <div className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5">
        <p className="mb-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">
          Vista previa
        </p>
        <p className="whitespace-pre-wrap text-ds-body text-ds-text-2">
          {previewText({
            ...draft,
            avoidWords: avoidInput
              .split(/[,;\n]/)
              .map((w) => w.trim())
              .filter(Boolean),
          })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {!readOnly && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-ds-body font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-10"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        )}
        {usePersonal && personalStyle && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void restoreCompany()}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-ds-border-default px-3 text-ds-body text-ds-text-2 ds-tap disabled:opacity-50 sm:h-10"
          >
            Restaurar valores de la empresa
          </button>
        )}
      </div>
    </>
  );
}
