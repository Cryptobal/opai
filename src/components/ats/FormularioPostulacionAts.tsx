"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  CheckCircle2,
  ExternalLink,
  Upload,
  X,
  FileText,
  User,
  Mail,
  Phone,
  CreditCard,
  Briefcase,
  Shield,
  Car,
  Calendar,
  MapPin,
  Hash,
} from "lucide-react";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import type {
  PublicFormConfig,
  PublicFormField,
  PublicFormDocument,
} from "@/lib/ats/public-form-config";

type FieldValue = string | number | boolean;
type FormStateMap = Record<string, FieldValue>;

interface UploadedDoc {
  fileUrl: string;
  fileName: string;
  mimeType: string;
}

interface FormularioPostulacionAtsProps {
  config: PublicFormConfig;
  tenantName: string;
}

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

function iconForField(key: string) {
  switch (key) {
    case "firstName":
    case "lastName":
    case "sex":
      return User;
    case "email":
      return Mail;
    case "phoneMobile":
      return Phone;
    case "rut":
      return CreditCard;
    case "experienciaAnios":
      return Briefcase;
    case "tieneOS10":
      return Shield;
    case "tieneMovilizacion":
      return Car;
    case "birthDate":
      return Calendar;
    case "addressFormatted":
    case "comuna":
    case "ciudad":
      return MapPin;
    default:
      return Hash;
  }
}

function initialFormState(config: PublicFormConfig): FormStateMap {
  const init: FormStateMap = {};
  for (const f of [...config.baseFields, ...config.extendedFields]) {
    if (f.type === "checkbox") init[f.key] = false;
    else if (f.type === "number") init[f.key] = 0;
    else init[f.key] = "";
  }
  return init;
}

export function FormularioPostulacionAts({
  config,
  tenantName,
}: FormularioPostulacionAtsProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormStateMap>(() =>
    initialFormState(config),
  );
  const [uploads, setUploads] = useState<Record<string, UploadedDoc>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const setField = useCallback((key: string, value: FieldValue) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setError((prev) => (prev ? null : prev));
  }, []);

  const handleAddressSelect = useCallback(
    (result: AddressResult) => {
      setFormState((prev) => {
        const next = { ...prev };
        if ("addressFormatted" in next) next.addressFormatted = result.address;
        if ("comuna" in next) next.comuna = result.commune || "";
        if ("ciudad" in next) next.ciudad = result.city || "";
        if ("region" in next) next.region = result.region || "";
        if ("googlePlaceId" in next) next.googlePlaceId = result.placeId || "";
        return next;
      });
    },
    [],
  );

  async function handleUpload(code: string, file: File) {
    setUploading((p) => ({ ...p, [code]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("jobPostingId", config.jobPostingId);
      const res = await fetch("/api/public/ats/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setUploads((p) => ({
          ...p,
          [code]: {
            fileUrl: data.data.fileUrl ?? data.data.url,
            fileName: data.data.fileName,
            mimeType: data.data.mimeType,
          },
        }));
        setError(null);
      } else {
        setError(data.error || "Error subiendo archivo");
      }
    } catch {
      setError("Error subiendo archivo");
    } finally {
      setUploading((p) => ({ ...p, [code]: false }));
    }
  }

  function removeUpload(code: string) {
    setUploads((p) => {
      const next = { ...p };
      delete next[code];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate required documents
    const missingDocs = config.documents
      .filter((d) => d.required && !uploads[d.code])
      .map((d) => d.label);
    if (missingDocs.length > 0) {
      setError(`Faltan documentos obligatorios: ${missingDocs.join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      // Cast number fields properly
      const payload: Record<string, unknown> = {
        jobPostingId: config.jobPostingId,
        ...formState,
        documentos: Object.entries(uploads).map(([code, v]) => ({
          code,
          ...v,
        })),
      };
      for (const f of [...config.baseFields, ...config.extendedFields]) {
        if (f.type === "number") {
          payload[f.key] = Number(formState[f.key] ?? 0);
        }
      }

      const res = await fetch("/api/public/ats/postular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || "Error al enviar postulación");
      }
    } catch {
      setError("Error de conexión. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // Success state — modal inviting to portal
  if (success) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-emerald-400" />
        <h3 className="mb-2 text-2xl font-bold text-white">
          Postulación enviada
        </h3>
        <p className="mb-6 text-slate-300">
          Tu postulación a{" "}
          <span className="font-semibold text-white">{config.job.titulo}</span>{" "}
          en <span className="font-semibold text-white">{tenantName}</span> fue
          recibida correctamente. Te contactaremos pronto.
        </p>

        <div className="mx-auto max-w-md rounded-xl border border-slate-700 bg-slate-900/80 p-6 text-left">
          <h4 className="mb-3 text-lg font-semibold text-white">
            Accede al Portal del Guardia
          </h4>
          <p className="mb-4 text-sm text-slate-400">
            Ingresa al portal para ver el estado de tu postulación, explorar
            más ofertas y completar tu perfil profesional.
          </p>
          <ul className="mb-5 space-y-2 text-sm text-slate-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Seguimiento en tiempo real de tus postulaciones
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Acceso a más ofertas de empleo disponibles
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Completa tu perfil para mejorar tu match
            </li>
          </ul>
          <a
            href="/portal/guardia"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
          >
            Ir al Portal del Guardia
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="text-center">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center rounded-lg bg-emerald-500 px-8 py-3 text-lg font-bold text-white transition-colors hover:bg-emerald-600"
        >
          Postular ahora
        </button>
      </div>
    );
  }

  const allFields = [...config.baseFields, ...config.extendedFields];

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 sm:p-8">
      <h3 className="mb-1 text-xl font-bold text-white">
        Postular a esta oferta
      </h3>
      <p className="mb-6 text-sm text-slate-400">
        Completa tus datos para postular. No necesitas crear una cuenta.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {allFields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={formState[field.key]}
            onChange={(v) => setField(field.key, v)}
            onAddressSelect={handleAddressSelect}
          />
        ))}

        {config.documents.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-semibold text-white">Documentos</h4>
            {config.documents.map((doc) => (
              <DocumentUploadRow
                key={doc.code}
                doc={doc}
                value={uploads[doc.code]}
                uploading={!!uploading[doc.code]}
                onUpload={(file) => handleUpload(doc.code, file)}
                onRemove={() => removeUpload(doc.code)}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-base font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar postulación"
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-lg px-4 py-3 text-sm text-slate-400 transition-colors hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Field renderer                                                     */
/* ------------------------------------------------------------------ */

interface FieldRendererProps {
  field: PublicFormField;
  value: FieldValue | undefined;
  onChange: (value: FieldValue) => void;
  onAddressSelect: (r: AddressResult) => void;
}

function FieldRenderer({
  field,
  value,
  onChange,
  onAddressSelect,
}: FieldRendererProps) {
  const Icon = iconForField(field.key);

  if (field.type === "checkbox") {
    return (
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
        />
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-white">
            {field.label}
            {field.required && (
              <span className="ml-2 text-xs text-amber-400">(requerido)</span>
            )}
          </span>
        </div>
      </label>
    );
  }

  const labelNode = (
    <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
      <Icon className="h-4 w-4 text-slate-500" />
      {field.label}
      {field.required && " *"}
    </span>
  );

  if (field.type === "address") {
    return (
      <label className="block">
        {labelNode}
        <AddressAutocomplete
          value={typeof value === "string" ? value : ""}
          onChange={onAddressSelect}
          placeholder="Buscar dirección..."
          showMap={false}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        {labelNode}
        <select
          required={field.required}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Selecciona...</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className="block">
        {labelNode}
        <textarea
          required={field.required}
          rows={3}
          maxLength={1000}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="block">
        {labelNode}
        <input
          type="number"
          required={field.required}
          min={0}
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className={inputClass}
        />
      </label>
    );
  }

  // text | email | tel | date
  return (
    <label className="block">
      {labelNode}
      <input
        type={field.type}
        required={field.required}
        maxLength={200}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Document upload row                                                */
/* ------------------------------------------------------------------ */

interface DocumentUploadRowProps {
  doc: PublicFormDocument;
  value: UploadedDoc | undefined;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

function DocumentUploadRow({
  doc,
  value,
  uploading,
  onUpload,
  onRemove,
}: DocumentUploadRowProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate text-sm font-medium text-white">
            {doc.label}
            {doc.required && <span className="ml-1 text-amber-400">*</span>}
          </span>
        </div>
        {value ? (
          <div className="flex items-center gap-2">
            <span className="max-w-[160px] truncate text-xs text-emerald-400">
              {value.fileName}
            </span>
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
              aria-label="Quitar archivo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600">
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Subir
              </>
            )}
            <input
              type="file"
              className="hidden"
              accept=".pdf,image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
