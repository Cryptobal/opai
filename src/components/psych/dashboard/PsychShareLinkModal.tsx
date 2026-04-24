"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  QrAndLink,
  SendResultList,
  type SendResultRow,
} from "./PsychShareLinkParts";

interface Props {
  assessmentId: string;
  url: string;
  expiresAt: string;
  candidateName: string;
  phone: string | null;
  onClose: () => void;
}

type Channel = "whatsapp" | "email" | "sms" | "copy-link";

const CHANNEL_OPTS: Array<[Channel, string]> = [
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["sms", "SMS"],
  ["copy-link", "Copiar link"],
];

type SendResult = SendResultRow;

export default function PsychShareLinkModal({
  assessmentId,
  url,
  expiresAt,
  candidateName,
  phone,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [channels, setChannels] = useState<Set<Channel>>(
    new Set(["copy-link"] as Channel[]),
  );
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, url, { width: 140, margin: 1 }).catch(() => void 0);
    }
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard */
    }
  };

  const toggle = (ch: Channel) =>
    setChannels((s) => {
      const n = new Set(s);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });

  const send = async () => {
    if (channels.size === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/psych/assessments/${assessmentId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channels: [...channels] }),
      });
      const j = await res.json();
      setResults(j.results ?? [{ channel: "copy-link", ok: false, reason: j.error ?? "Error" }]);
    } finally {
      setSending(false);
    }
  };

  const waText = encodeURIComponent(`Test psicolaboral para ${candidateName}: ${url}`);
  const waFallback = phone
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${waText}`
    : `https://wa.me/?text=${waText}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-semibold text-slate-900">Evaluación creada</h3>
        <p className="text-sm text-slate-600">
          Comparte con {candidateName}. Expira el{" "}
          {new Date(expiresAt).toLocaleDateString("es-CL")}.
        </p>
        <QrAndLink qrRef={qrRef} url={url} copied={copied} onCopy={copy} />
        <fieldset className="space-y-1.5">
          <legend className="text-xs uppercase tracking-wider text-slate-500">Canales de envío</legend>
          {CHANNEL_OPTS.map(([ch, label]) => (
            <label key={ch} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={channels.has(ch)} onChange={() => toggle(ch)} />
              {label}
            </label>
          ))}
        </fieldset>
        <button
          onClick={send}
          disabled={sending || channels.size === 0}
          className="w-full rounded-lg bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
        {results ? <SendResultList rows={results} /> : null}
        <div className="flex gap-2 pt-2">
          <a href={waFallback} target="_blank" rel="noopener noreferrer" className="flex-1 text-center text-xs rounded-lg bg-emerald-600 text-white px-3 py-2">
            WhatsApp Web
          </a>
          <button onClick={onClose} className="flex-1 rounded-lg bg-slate-100 text-slate-700 px-3 py-2 text-xs">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}



