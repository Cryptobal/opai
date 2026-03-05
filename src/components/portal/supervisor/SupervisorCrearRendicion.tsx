"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { SupervisorInstallation } from "@/lib/portal-supervisor";

interface Props {
  installations: SupervisorInstallation[];
  onBack: () => void;
  onCreated: () => void;
}

type DocType = "BOLETA" | "FACTURA" | "SIN_RESPALDO";
type RendType = "PURCHASE" | "MILEAGE";

export function SupervisorCrearRendicion({ installations, onBack, onCreated }: Props) {
  const [type, setType] = useState<RendType>("PURCHASE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<DocType>("BOLETA");
  const [costCenterId] = useState(""); // pre-set to selected installation
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/finance/rendiciones/attachments/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.url) {
        setAttachmentUrl(json.url);
        toast.success("Comprobante subido");
      } else {
        toast.error("Error al subir comprobante");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(asDraft: boolean) {
    const amountNum = Number(amount.replace(/\./g, "").replace(",", ""));
    if (!amount || isNaN(amountNum) || amountNum < 0) {
      toast.error("Ingresa un monto válido.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type,
        amount: amountNum,
        date,
        description: description.trim() || undefined,
        documentType: docType,
      };

      const res = await fetch("/api/finance/rendiciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error ?? "Error al crear rendición");
        return;
      }

      const rendId = json.data?.id;

      // Submit if not draft
      if (!asDraft && rendId) {
        await fetch(`/api/finance/rendiciones/${rendId}/submit`, { method: "POST" });
      }

      toast.success(asDraft ? "Guardado como borrador" : "Rendición enviada");
      onCreated();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-32">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold">Nueva Rendición</h2>
      </div>

      {/* Tipo */}
      <Field label="Tipo">
        <div className="flex gap-2">
          {(["PURCHASE", "MILEAGE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                type === t
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400"
              }`}
            >
              {t === "PURCHASE" ? "Compra / Gasto" : "Kilometraje"}
            </button>
          ))}
        </div>
      </Field>

      {/* Monto */}
      <Field label="Monto (CLP) *">
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </Field>

      {/* Fecha */}
      <Field label="Fecha *">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </Field>

      {/* Descripción */}
      <Field label="Descripción">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el gasto..."
          rows={2}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </Field>

      {/* Tipo documento */}
      {type === "PURCHASE" && (
        <Field label="Tipo de documento">
          <div className="flex gap-2">
            {(["BOLETA", "FACTURA", "SIN_RESPALDO"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDocType(d)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  docType === d
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                }`}
              >
                {d === "BOLETA" ? "Boleta" : d === "FACTURA" ? "Factura" : "Sin respaldo"}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Foto comprobante */}
      <Field label="Comprobante">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        {attachmentUrl ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-900 border border-emerald-500/30">
            <img src={attachmentUrl} alt="comprobante" className="w-12 h-12 object-cover rounded-md" />
            <p className="text-xs text-emerald-400 flex-1">Comprobante subido</p>
            <button onClick={() => setAttachmentUrl(null)} className="text-zinc-500">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 w-full p-3 rounded-lg bg-zinc-900 border border-zinc-800 border-dashed text-zinc-400 hover:border-zinc-600 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Camera size={16} />
            )}
            <span className="text-sm">{uploading ? "Subiendo..." : "Tomar foto del comprobante"}</span>
          </button>
        )}
      </Field>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleSubmit(true)}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          Guardar borrador
        </button>
        <button
          onClick={() => handleSubmit(false)}
          disabled={submitting || !amount}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Enviar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}
