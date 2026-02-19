"use client";

import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { CalendarDays, FilePlus2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  completeRutWithDv,
  DEFAULT_POSTULACION_DOCUMENTS,
  formatRutForInput,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  isChileanRutFormat,
  isValidChileanRut,
  normalizeMobileNineDigits,
  normalizeRut,
  PAISES_AMERICA,
  PERSON_SEX,
} from "@/lib/personas";

type DocTypeConfig = { code: string; label: string; required: boolean };

type UploadedDoc = {
  id: string;
  type: string;
  fileUrl: string;
  fileName?: string;
};

interface PostulacionPublicFormProps {
  token: string;
}

export function PostulacionPublicForm({ token }: PostulacionPublicFormProps) {
  const [documentTypes, setDocumentTypes] = useState<DocTypeConfig[]>(DEFAULT_POSTULACION_DOCUMENTS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docType, setDocType] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [healthSystem, setHealthSystem] = useState("fonasa");

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/postulacion/document-types?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.success && Array.isArray(data.data) && data.data.length > 0) {
          setDocumentTypes(data.data);
          setDocType((prev) => {
            const first = data.data[0].code;
            return data.data.some((d: DocTypeConfig) => d.code === prev) ? prev : first;
          });
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (documentTypes.length > 0 && !documentTypes.some((d) => d.code === docType)) {
      setDocType(documentTypes[0].code);
    }
  }, [documentTypes, docType]);
  const [isapreHasExtraPercent, setIsapreHasExtraPercent] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phoneMobile: "",
    addressFormatted: "",
    googlePlaceId: "",
    commune: "",
    city: "",
    region: "",
    lat: "",
    lng: "",
    birthDate: "",
    sex: "",
    nacionalidad: "Chile",
    afp: "",
    isapreName: "",
    isapreExtraPercent: "",
    hasMobilization: "si",
    availableExtraShifts: "si",
    bankCode: "",
    accountType: "",
    accountNumber: "",
    notes: "",
  });
  const [rutError, setRutError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      body.append("token", token);
      body.append("file", file);
      const response = await fetch("/api/public/postulacion/upload", {
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
      setDocFileName(file.name);
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
      !form.email.trim() ||
      !form.phoneMobile.trim() ||
      !form.addressFormatted.trim() ||
      !form.googlePlaceId ||
      !form.birthDate ||
      !form.sex ||
      !form.afp ||
      !form.bankCode ||
      !form.accountType ||
      !form.accountNumber.trim() ||
      uploadedDocs.length === 0
    ) {
      toast.error("Completa todos los campos obligatorios");
      return;
    }
    if (healthSystem === "isapre" && !form.isapreName) {
      toast.error("Debes seleccionar Isapre");
      return;
    }
    if (healthSystem === "isapre" && isapreHasExtraPercent && Number(form.isapreExtraPercent || 0) <= 7) {
      toast.error("Si cotiza sobre 7%, indica un porcentaje mayor a 7");
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
      const response = await fetch("/api/public/postulacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          rut: normalizeRut(completedRut),
          email: form.email.trim(),
          phoneMobile: normalizeMobileNineDigits(form.phoneMobile),
          addressFormatted: form.addressFormatted.trim(),
          googlePlaceId: form.googlePlaceId,
          commune: form.commune.trim() || null,
          city: form.city.trim() || null,
          region: form.region.trim() || null,
          lat: form.lat,
          lng: form.lng,
          birthDate: form.birthDate,
          sex: form.sex,
          nacionalidad: form.nacionalidad || "Chile",
          afp: form.afp,
          healthSystem,
          isapreName: healthSystem === "isapre" ? form.isapreName : null,
          isapreHasExtraPercent: healthSystem === "isapre" ? isapreHasExtraPercent : false,
          isapreExtraPercent:
            healthSystem === "isapre" && isapreHasExtraPercent
              ? form.isapreExtraPercent
              : null,
          hasMobilization: form.hasMobilization === "si",
          availableExtraShifts: form.availableExtraShifts === "si",
          bankCode: form.bankCode,
          accountType: form.accountType,
          accountNumber: form.accountNumber.trim(),
          notes: form.notes.trim() || null,
          documents: uploadedDocs.map((doc) => ({ type: doc.type, fileUrl: doc.fileUrl })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar la postulación");
      }
      toast.success("Postulación enviada correctamente");
      setSubmitSuccessMessage(
        "Formulario enviado correctamente. Gracias, nuestro equipo revisará tu postulación y te contactará pronto."
      );
      setForm({
        firstName: "",
        lastName: "",
        rut: "",
        email: "",
        phoneMobile: "",
        addressFormatted: "",
        googlePlaceId: "",
        commune: "",
        city: "",
        region: "",
        lat: "",
        lng: "",
        birthDate: "",
        sex: "",
        nacionalidad: "Chile",
        afp: "",
        isapreName: "",
        isapreExtraPercent: "",
        hasMobilization: "si",
        availableExtraShifts: "si",
        bankCode: "",
        accountType: "",
        accountNumber: "",
        notes: "",
      });
      setUploadedDocs([]);
      setDocFileName("");
      setHealthSystem("fonasa");
      setIsapreHasExtraPercent(false);
      setRutError(null);
    } catch (error) {
      console.error(error);
      const msg = (error as Error)?.message || "No se pudo enviar la postulación";
      if (/rut|root/i.test(msg)) {
        setRutError("RUT ya ingresado / root ya ingresado.");
        toast.error("RUT ya ingresado / root ya ingresado. Comunicarse con recursos humanos.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-4 rounded-xl border border-border bg-[#0f2847] px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Gard Security</p>
          <p className="text-base text-white font-semibold">Portal corporativo de postulación</p>
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
          <CardTitle>Formulario de postulación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completa tus datos y sube tus documentos para que el equipo de operaciones revise tu postulación.
          </p>
          {submitSuccessMessage ? (
            <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {submitSuccessMessage}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
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
              placeholder="Email *"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
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
              className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring"
              role="group"
            >
              <input
                type="date"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground outline-none [color-scheme:light]"
                value={form.birthDate}
                onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                id="postulacion-birthdate"
                aria-label="Fecha de nacimiento"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 border-border bg-muted/50 text-foreground hover:bg-muted"
                onClick={() => (document.getElementById("postulacion-birthdate") as HTMLInputElement | null)?.showPicker?.()}
                title="Abrir calendario"
              >
                <CalendarDays className="h-4 w-4 text-white" />
              </Button>
              <span className="shrink-0 text-muted-foreground">Fecha de nacimiento</span>
            </div>
            <div className="md:col-span-2">
              <AddressAutocomplete
                value={form.addressFormatted}
                onChange={onAddressChange}
                placeholder="Dirección (Google Maps) *"
                showMap
              />
            </div>
            <Input
              placeholder="Comuna"
              value={form.commune}
              readOnly
            />
            <Input
              placeholder="Ciudad"
              value={form.city}
              readOnly
            />
            <Input
              placeholder="Región"
              value={form.region}
              readOnly
            />
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.sex}
              onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))}
            >
              <option value="">Sexo *</option>
              {PERSON_SEX.map((sex) => (
                <option key={sex} value={sex}>
                  {sex}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.nacionalidad}
              onChange={(e) => setForm((prev) => ({ ...prev, nacionalidad: e.target.value }))}
            >
              {PAISES_AMERICA.map((pais) => (
                <option key={pais} value={pais}>
                  {pais}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.afp}
              onChange={(e) => setForm((prev) => ({ ...prev, afp: e.target.value }))}
            >
              <option value="">AFP *</option>
              {AFP_CHILE.map((afp) => (
                <option key={afp} value={afp}>
                  {afp}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={healthSystem}
              onChange={(e) => {
                setHealthSystem(e.target.value);
                if (e.target.value !== "isapre") {
                  setForm((prev) => ({ ...prev, isapreName: "", isapreExtraPercent: "" }));
                  setIsapreHasExtraPercent(false);
                }
              }}
            >
              {HEALTH_SYSTEMS.map((health) => (
                <option key={health} value={health}>
                  Salud: {health.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.hasMobilization}
              onChange={(e) => setForm((prev) => ({ ...prev, hasMobilization: e.target.value }))}
            >
              <option value="si">Tiene movilización</option>
              <option value="no">No tiene movilización</option>
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.availableExtraShifts}
              onChange={(e) => setForm((prev) => ({ ...prev, availableExtraShifts: e.target.value }))}
            >
              <option value="si">Disponible para turnos extra</option>
              <option value="no">No disponible para turnos extra</option>
            </select>
            {healthSystem === "isapre" ? (
              <>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.isapreName}
                  onChange={(e) => setForm((prev) => ({ ...prev, isapreName: e.target.value }))}
                >
                  <option value="">Isapre *</option>
                  {ISAPRES_CHILE.map((isapre) => (
                    <option key={isapre} value={isapre}>
                      {isapre}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={isapreHasExtraPercent ? "si" : "no"}
                  onChange={(e) => setIsapreHasExtraPercent(e.target.value === "si")}
                >
                  <option value="no">Cotiza solo 7%</option>
                  <option value="si">Cotiza sobre 7%</option>
                </select>
                <Input
                  type="number"
                  step="0.01"
                  min="7.01"
                  placeholder="Porcentaje cotización ISAPRE"
                  value={form.isapreExtraPercent}
                  disabled={!isapreHasExtraPercent}
                  onChange={(e) => setForm((prev) => ({ ...prev, isapreExtraPercent: e.target.value }))}
                />
              </>
            ) : null}
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.bankCode}
              onChange={(e) => setForm((prev) => ({ ...prev, bankCode: e.target.value }))}
            >
              <option value="">Banco *</option>
              {CHILE_BANKS.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={form.accountType}
              onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value }))}
            >
              <option value="">Tipo de cuenta *</option>
              {BANK_ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <Input
              placeholder="Número de cuenta *"
              value={form.accountNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
            />
            <Input
              className="md:col-span-2"
              placeholder="Notas o comentarios (opcional)"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium">Documentos</p>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {documentTypes.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.required ? "(*) " : ""}{d.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDocFileName("");
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar otro
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void handleUpload(file);
                  e.target.value = "";
                }}
                disabled={uploading}
                aria-hidden
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <FilePlus2 className="h-4 w-4 mr-1" />
                {uploading ? "Subiendo..." : "Cargar documento"}
              </Button>
            </div>
            {docFileName ? (
              <p className="text-xs text-muted-foreground">Archivo seleccionado: {docFileName}</p>
            ) : null}
            {uploadedDocs.length > 0 ? (
              <div className="space-y-2">
                {uploadedDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="text-sm">{documentTypes.find((d) => d.code === doc.type)?.label ?? doc.type}{doc.fileName ? ` · ${doc.fileName}` : ""}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Ver
                      </a>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDoc(doc.id)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Debes subir al menos un documento (puedes cargar varios).
                {documentTypes.some((d) => d.required) && (
                  <> Los marcados con (*) son obligatorios para enviar la postulación.</>
                )}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={saving}>
              <Upload className="h-4 w-4 mr-1" />
              {saving ? "Enviando..." : "Enviar postulación"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
