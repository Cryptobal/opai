"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_SMS_TEMPLATE,
} from "@/lib/psych/resolveMessageTokens";
import {
  TemplateField as Field,
  TemplatePreview as Preview,
} from "./PsychTemplatesHelpers";

interface State {
  whatsappTemplate: string;
  emailSubject: string;
  emailBody: string;
  smsTemplate: string;
}

export default function PsychTemplatesForm() {
  const [s, setS] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/psych/config")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const c = j.config;
          setS({
            whatsappTemplate: c.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE,
            emailSubject: c.emailSubject ?? DEFAULT_EMAIL_SUBJECT,
            emailBody: c.emailBody ?? DEFAULT_EMAIL_BODY,
            smsTemplate: c.smsTemplate ?? DEFAULT_SMS_TEMPLATE,
          });
        }
      });
  }, []);

  if (!s) return <p className="text-muted-foreground text-sm">Cargando plantillas…</p>;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/psych/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(s),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Error");
      setMsg("Plantillas guardadas");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function upd<K extends keyof State>(k: K, v: State[K]) {
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
        Tokens disponibles:{" "}
        <code>{"{{nombre}}"}</code> · <code>{"{{link}}"}</code> ·{" "}
        <code>{"{{expira}}"}</code> · <code>{"{{tenant}}"}</code>
      </div>
      <Field label="WhatsApp — Mensaje" hint={`${s.whatsappTemplate.length} caracteres`}>
        <textarea
          rows={3}
          value={s.whatsappTemplate}
          onChange={(e) => upd("whatsappTemplate", e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <Preview value={s.whatsappTemplate} />
      </Field>
      <Field label="Email — Asunto">
        <input
          value={s.emailSubject}
          onChange={(e) => upd("emailSubject", e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Email — Cuerpo">
        <textarea
          rows={6}
          value={s.emailBody}
          onChange={(e) => upd("emailBody", e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
        />
        <Preview value={s.emailBody} />
      </Field>
      <Field label="SMS">
        <textarea
          rows={2}
          value={s.smsTemplate}
          onChange={(e) => upd("smsTemplate", e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        <Preview value={s.smsTemplate} />
      </Field>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar plantillas"}
        </button>
        {msg ? <span className="text-sm text-muted-foreground">{msg}</span> : null}
      </div>
    </div>
  );
}
