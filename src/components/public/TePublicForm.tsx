"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { CalendarDays, FilePlus2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  completeRutWithDv,
  formatRutForInput,
  isChileanRutFormat,
  isValidChileanRut,
  normalizeMobileNineDigits,
  normalizeRut,
} from "@/lib/personas";

type DocTypeConfig = { code: string; label: string; required: boolean };

type UploadedDoc = {
  id: string;
  type: string;
  fileUrl: string;
  fileName?: string;
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cuenta_corriente: "Cuenta corriente",
  cuenta_vista: "Cuenta vista",
  cuenta_rut: "Cuenta RUT",
};

export function TePublicForm() {
  const [documentTypes, setDocumentTypes] = useState<DocTypeConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docType, setDocType] = useState("");
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    phoneMobile: "",
    addressFormatted: "",
    googlePlaceId: "",
    commune: "",
    city: "",
    region: "",
    lat: "",
    lng: "",
    birthDate: "",
    bankCode: "",
    accountType: "",
    accountNumber: "",
  });
  const [rutError, setRutError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/public/ingreso-te/document-types")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.success && Array.isArray(data.data)) {
          setDocumentTypes(data.data);
          if (data.data.length > 0) {
            setDocType((prev) =>
              data.data.some((d: DocTypeConfig) => d.code === prev) ? prev : data.data[0].code
            );
          }
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (documentTypes.length > 0 && !documentTypes.some((d) => d.code === docType)) {
      setDocType(documentTypes[0].code);
    }
  }, [documentTypes, docType]);

  const onAddressChange = (result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      addressFormatted: result.address,
      googlePlaceId: result.placeId || "",
      commune: result.commune || "",
      city: result.city || "",
      region: result.region || "",
      lat: String(result.lat || ""),
      lng: String(result.lng || ""),
    }));
  };

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    if (!docType) {
      toast.error("Selecciona tipo de documento");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/public/ingreso-te/upload", {
        method: "POST",
        body,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo subir el archivo");
      }
      setUploadedDocs((prev) => [
        {
          id: crypto.randomUUID(),
          type: docType,
          fileUrl: payload.data.url,
          fileName: file.name,
        },
        ...prev,
      ]);
      toast.success("Documento subido");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo subir el documento");
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = (id: string) => {
    setUploadedDocs((prev) => prev.filter((doc) => doc.id !== id));
  };

  const handleSubmit = async () => {
    setSubmitSuccessMessage(null);

    // Validate required documents
    const requiredCodes = documentTypes.filter((d) => d.required).map((d) => d.code);
    const uploadedTypes = new Set(uploadedDocs.map((d) => d.type));
    const missingRequired = requiredCodes.filter((code) => !uploadedTypes.has(code));
    if (missingRequired.length > 0) {
      const names = missingRequired
        .map((code) => documentTypes.find((d) => d.code === code)?.label ?? code)
        .join(", ");
      toast.error(`Faltan documentos obligatorios: ${names}`);
      return;
    }

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.rut.trim() ||
      !form.phoneMobile.trim() ||
      !form.addressFormatted.trim() ||
      !form.googlePlaceId ||
      !form.birthDate ||
      !form.bankCode ||
      !form.accountType ||
      !form.accountNumber.trim()
    ) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }

    const completedRut = completeRutWithDv(form.rut);
    if (!isChileanRutFormat(completedRut) || !isValidChileanRut(completedRut)) {
      setRutError("RUT inválido. Verifica guión y dígito verificador.");
      toast.error("Corrige el RUT antes de enviar");
      return;
    }
    setForm((prev) => ({ ...prev, rut: completedRut }));
    setRutError(null);

    setSaving(true);
    try {
      const response = await fetch("/api/public/ingreso-te", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          rut: normalizeRut(completedRut),
          phoneMobile: normalizeMobileNineDigits(form.phoneMobile),
          addressFormatted: form.addressFormatted.trim(),
          googlePlaceId: form.googlePlaceId,
          commune: form.commune.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          lat: form.lat,
          lng: form.lng,
          birthDate: form.birthDate,
          bankCode: form.bankCode,
          accountType: form.accountType,
          accountNumber: form.accountNumber.trim(),
          documents: uploadedDocs.map((doc) => ({ type: doc.type, fileUrl: doc.fileUrl })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar el formulario");
      }
      toast.success("Registro enviado correctamente");
      setSubmitSuccessMessage(
        "Formulario enviado correctamente. Gracias, nuestro equipo revisará tus datos y te contactará pronto."
      );
      setForm({
        firstName: "",
        lastName: "",
        rut: "",
        phoneMobile: "",
        addressFormatted: "",
        googlePlaceId: "",
        commune: "",
        city: "",
        region: "",
        lat: "",
        lng: "",
        birthDate: "",
        bankCode: "",
        accountType: "",
        accountNumber: "",
      });
      setUploadedDocs([]);
      setRutError(null);
    } catch (error) {
      console.error(error);
      const msg = (error as Error)?.message || "No se pudo enviar el formulario";
      if (/rut|root/i.test(msg)) {
        setRutError("RUT ya ingresado.");
        toast.error("RUT ya ingresado. Comunicarse con recursos humanos.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-4 rounded-xl border border-border bg-[#0f2847] px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Gard Security</p>
          <p className="text-base text-white font-semibold">Ingreso Turno Extra</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Logo%20Gard%20Blanco.png"
          alt="Logo Gard Security"
          className="h-8 w-auto"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Formulario de ingreso - Turno Extra</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completa tus datos personales, bancarios y sube los documentos requeridos.
          </p>
          {submitSuccessMessage ? (
            <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {submitSuccessMessage}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Datos personales */}
          <h3 className="text-sm font-semibold text-foreground">Datos personales</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Nombre *"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
            />
            <Input
              placeholder="Apellido *"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
            />
            <div className="space-y-1">
              <Input
                placeholder="RUT * (sin puntos y con guión)"
                value={form.rut}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    rut: formatRutForInput(e.target.value),
                  }))
                }
                onBlur={() => {
                  const completed = completeRutWithDv(form.rut);
                  setForm((prev) => ({ ...prev, rut: completed }));
                  if (completed && (!isChileanRutFormat(completed) || !isValidChileanRut(completed))) {
                    setRutError("RUT inválido. Verifica guión y dígito verificador.");
                  } else {
                    setRutError(null);
                  }
                }}
              />
              {rutError ? <p className="text-xs text-red-400">{rutError}</p> : null}
            </div>
            <Input
              placeholder="Celular * (9 dígitos)"
              value={form.phoneMobile}
              maxLength={9}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  phoneMobile: normalizeMobileNineDigits(e.target.value).slice(0, 9),
                }))
              }
            />
            <div
              className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring"
              role="group"
            >
              <input
                type="date"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground outline-none [color-scheme:light]"
                value={form.birthDate}
                onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                id="te-birthdate"
                aria-label="Fecha de nacimiento"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 border-border bg-muted/50 text-foreground hover:bg-muted"
                onClick={() => (document.getElementById("te-birthdate") as HTMLInputElement | null)?.showPicker?.()}
                title="Abrir calendario"
              >
                <CalendarDays className="h-4 w-4 text-white" />
              </Button>
              <span className="shrink-0 text-muted-foreground">Fecha de nacimiento *</span>
            </div>
            <div className="md:col-span-2">
              <AddressAutocomplete
                value={form.addressFormatted}
                onChange={onAddressChange}
                placeholder="Dirección (Google Maps) *"
                showMap
              />
            </div>
            <Input placeholder="Comuna" value={form.commune} readOnly />
            <Input placeholder="Ciudad" value={form.city} readOnly />
          </div>

          {/* Datos bancarios */}
          <h3 className="text-sm font-semibold text-foreground pt-2">Datos bancarios</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <SearchableSelect
              value={form.bankCode}
              options={CHILE_BANKS.map((b) => ({ id: b.code, label: b.name }))}
              placeholder="Banco *"
              onChange={(val) => setForm((prev) => ({ ...prev, bankCode: val }))}
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.accountType}
              onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value }))}
            >
              <option value="">Tipo de cuenta *</option>
              {BANK_ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <Input
              placeholder="Número de cuenta *"
              value={form.accountNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
            />
          </div>

          {/* Documentos */}
          {documentTypes.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-foreground pt-2">Documentos</h3>
              <p className="text-xs text-muted-foreground">
                {documentTypes.some((d) => d.required)
                  ? `Documentos obligatorios: ${documentTypes
                      .filter((d) => d.required)
                      .map((d) => d.label)
                      .join(", ")}`
                  : "Sube los documentos que apliquen."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {documentTypes.map((dt) => (
                    <option key={dt.code} value={dt.code}>
                      {dt.label}
                      {dt.required ? " *" : ""}
                    </option>
                  ))}
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  className="hidden"
                  onChange={(e) => {
                    void handleUpload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploading || !docType}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    "Subiendo..."
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Subir archivo
                    </>
                  )}
                </Button>
              </div>
              {uploadedDocs.length > 0 && (
                <div className="space-y-1">
                  {uploadedDocs.map((doc) => {
                    const label = documentTypes.find((d) => d.code === doc.type)?.label ?? doc.type;
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm"
                      >
                        <FilePlus2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium">{label}</span>
                        <span className="text-muted-foreground truncate">{doc.fileName}</span>
                        <button
                          type="button"
                          className="ml-auto text-muted-foreground hover:text-destructive"
                          onClick={() => removeDoc(doc.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Submit */}
          <div className="flex justify-end pt-4">
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="px-8"
            >
              {saving ? "Enviando..." : "Enviar formulario"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
