"use client";

/**
 * Timeline de envíos de email de un DTE. Muestra historial auditable
 * (auto vs manual, receptor vs backoffice, sent vs failed).
 */
import * as React from "react";
import { CheckCircle2, XCircle, Mail, FileCode } from "lucide-react";

type EmailLog = {
  id: string;
  kind: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  attachments: string;
  status: "sent" | "failed" | string;
  resendId: string | null;
  errorMessage: string | null;
  sentAt: string;
  sentBy: string | null;
};

// Soporta tanto los kinds legacy snake_case que pueda haber en BD (pre-migración
// 1.C) como los uppercase del enum FinanceDteEmailKind post-migración. Después
// de aplicar la migración solo deberían llegar los uppercase, pero mantenemos
// ambos por defensa hasta que se borre este componente en Fase 4 a favor de
// EnviosTabContent.
const KIND_LABELS: Record<string, { label: string; auto: boolean }> = {
  auto_receiver: { label: "Email automático al receptor", auto: true },
  auto_backoffice: { label: "XML automático al backoffice", auto: true },
  manual_resend: { label: "Reenvío manual al receptor", auto: false },
  manual_override_recipient: { label: "Reenvío con email distinto", auto: false },
  manual_backoffice: { label: "Reenvío XML al backoffice", auto: false },
  proforma_sent: { label: "Proforma enviada", auto: false },
  estado_pago_sent: { label: "Estado de pago enviado", auto: false },
  proforma_failed: { label: "Proforma falló", auto: false },
  estado_pago_failed: { label: "Estado de pago falló", auto: false },
  AUTO_RECEIVER: { label: "Email automático al receptor", auto: true },
  AUTO_BACKOFFICE: { label: "XML automático al backoffice", auto: true },
  MANUAL_RESEND: { label: "Reenvío manual al receptor", auto: false },
  MANUAL_OVERRIDE_RECIPIENT: { label: "Reenvío con email distinto", auto: false },
  MANUAL_BACKOFFICE: { label: "Reenvío XML al backoffice", auto: false },
  PROFORMA_SENT: { label: "Proforma enviada", auto: false },
  ESTADO_PAGO_SENT: { label: "Estado de pago enviado", auto: false },
  PROFORMA_FAILED: { label: "Proforma falló", auto: false },
  ESTADO_PAGO_FAILED: { label: "Estado de pago falló", auto: false },
};

export function DteEmailTimeline({ dteId }: { dteId: string }) {
  const [logs, setLogs] = React.useState<EmailLog[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/finance/billing/issued/${dteId}/email-log`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setLogs(j.data?.logs ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [dteId]);

  if (loading) return null;
  if (logs.length === 0) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Historial de envíos
        </p>
        <p className="text-sm text-muted-foreground italic">
          Aún no se han registrado envíos para este DTE.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
        Historial de envíos
      </p>
      <ul className="space-y-3">
        {logs.map((log) => {
          const meta = KIND_LABELS[log.kind] ?? { label: log.kind, auto: false };
          const isOk = log.status === "sent";
          return (
            <li key={log.id} className="flex gap-2 text-sm">
              <div className="shrink-0 mt-0.5">
                {isOk ? (
                  <CheckCircle2 className="size-4 text-status-ok-fg" />
                ) : (
                  <XCircle className="size-4 text-status-danger-fg" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{meta.label}</span>
                  {meta.auto ? (
                    <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                      automático
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-status-info-fg">
                      manual
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.sentAt).toLocaleString("es-CL")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 break-all">
                  <span className="inline-flex items-start gap-1">
                    {log.attachments === "xml_only" ? (
                      <FileCode className="size-3 mt-0.5 shrink-0" />
                    ) : (
                      <Mail className="size-3 mt-0.5 shrink-0" />
                    )}
                    <span>
                      To: {log.to.join(", ")}
                      {log.cc.length > 0 && ` · CC: ${log.cc.join(", ")}`}
                      {log.bcc && log.bcc.length > 0 && (
                        <span className="text-ds-text-4">
                          {" "}
                          · BCC: {log.bcc.join(", ")}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
                {!isOk && log.errorMessage && (
                  <div className="text-xs text-status-danger-fg mt-0.5">{log.errorMessage}</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
