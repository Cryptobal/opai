"use client";

import { useBranding } from "@/lib/branding/useBranding";
import { CalendarDays, FilePlus2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  completeRutWithDv,
  formatRutForInput,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PANTS_SIZES,
  isChileanRutFormat,
  isValidChileanRut,
  normalizeMobileNineDigits,
  PAISES_AMERICA,
  PERSON_SEX,
  SHOE_SIZES,
  TOP_GARMENT_SIZES,
} from "@/lib/personas";
import { usePostulacionForm } from "./usePostulacionForm";

interface PostulacionWizardProps {
  token: string;
  tenantSlug: string;
}

export function PostulacionWizard({ token, tenantSlug }: PostulacionWizardProps) {
  const { branding } = useBranding();
  const {
    documentTypes,
    saving,
    uploading,
    uploadedDocs,
    docType,
    setDocType,
    docFileName,
    setDocFileName,
    healthSystem,
    setHealthSystem,
    isapreHasExtraPercent,
    setIsapreHasExtraPercent,
    submitSuccessMessage,
    form,
    setForm,
    rutError,
    setRutError,
    fileInputRef,
    onAddressChange,
    handleUpload,
    removeDoc,
    handleSubmit,
  } = usePostulacionForm({ token, tenantSlug });

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="mb-4 rounded-xl border border-border bg-[#0f2847] px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">{branding.companyName}</p>
          <p className="text-base text-white font-semibold">Portal corporativo de postulación</p>
        </div>
        {branding.logoWhite && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={branding.logoWhite} alt={`Logo ${branding.companyName}`} className="h-8 w-auto" />
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Formulario de postulación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completa tus datos y sube tus documentos para que el equipo de operaciones revise tu postulación.
          </p>
          {submitSuccessMessage ? (
            <div className="mt-3 rounded-md border border-status-ok-border bg-status-ok-soft px-4 py-3 text-sm text-status-ok-fg">
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
                onChange={(e) => setForm((prev) => ({ ...prev, rut: formatRutForInput(e.target.value) }))}
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
              {rutError ? <p className="text-xs text-status-danger-fg">{rutError}</p> : null}
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
                setForm((prev) => ({ ...prev, phoneMobile: normalizeMobileNineDigits(e.target.value).slice(0, 9) }))
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
                id="postulacion-birthdate"
                aria-label="Fecha de nacimiento"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 border-border bg-muted/50 text-foreground hover:bg-muted"
                onClick={() =>
                  (document.getElementById("postulacion-birthdate") as HTMLInputElement | null)?.showPicker?.()
                }
                title="Abrir calendario"
              >
                <CalendarDays className="h-4 w-4 text-white" />
              </Button>
              <span className="shrink-0 text-muted-foreground">Fecha de nacimiento</span>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <p className="text-sm font-medium text-foreground">Dirección *</p>
              <p className="text-xs text-muted-foreground">
                Escribe calle y número; elige una sugerencia de calle (no solo el nombre del sector).
              </p>
              <AddressAutocomplete
                value={form.addressFormatted}
                onChange={onAddressChange}
                placeholder="Ej: Av. Principal 123, comuna…"
                showMap
              />
            </div>
            <Input placeholder="Comuna" value={form.commune} readOnly />
            <Input placeholder="Ciudad" value={form.city} readOnly />
            <Input placeholder="Región" value={form.region} readOnly />
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
            <SearchableSelect
              value={form.nacionalidad}
              options={PAISES_AMERICA.map((pais) => ({ id: pais, label: pais }))}
              placeholder="Nacionalidad"
              emptyText="Sin resultados"
              onChange={(id) => setForm((prev) => ({ ...prev, nacionalidad: id }))}
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.hasMobilization}
              onChange={(e) => setForm((prev) => ({ ...prev, hasMobilization: e.target.value }))}
            >
              <option value="si">Tiene movilización</option>
              <option value="no">No tiene movilización</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.availableExtraShifts}
              onChange={(e) => setForm((prev) => ({ ...prev, availableExtraShifts: e.target.value }))}
            >
              <option value="si">Disponible para turnos extra</option>
              <option value="no">No disponible para turnos extra</option>
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.shoeSize}
              onChange={(e) => setForm((prev) => ({ ...prev, shoeSize: e.target.value }))}
            >
              <option value="">Calzado</option>
              {SHOE_SIZES.map((size) => (
                <option key={size} value={size}>
                  Calzado {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.pantsSize}
              onChange={(e) => setForm((prev) => ({ ...prev, pantsSize: e.target.value }))}
            >
              <option value="">Pantalón</option>
              {PANTS_SIZES.map((size) => (
                <option key={size} value={size}>
                  Pantalón {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.tshirtSize}
              onChange={(e) => setForm((prev) => ({ ...prev, tshirtSize: e.target.value }))}
            >
              <option value="">Polera</option>
              {TOP_GARMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  Polera {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.shirtSize}
              onChange={(e) => setForm((prev) => ({ ...prev, shirtSize: e.target.value }))}
            >
              <option value="">Camisa</option>
              {TOP_GARMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  Camisa {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.geologoSize}
              onChange={(e) => setForm((prev) => ({ ...prev, geologoSize: e.target.value }))}
            >
              <option value="">Geólogo</option>
              {TOP_GARMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  Geólogo {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.polarSize}
              onChange={(e) => setForm((prev) => ({ ...prev, polarSize: e.target.value }))}
            >
              <option value="">Polar</option>
              {TOP_GARMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  Polar {size}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              value={form.jacketSize}
              onChange={(e) => setForm((prev) => ({ ...prev, jacketSize: e.target.value }))}
            >
              <option value="">Chaqueta</option>
              {TOP_GARMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  Chaqueta {size}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min="120"
              max="230"
              step="0.1"
              placeholder="Estatura (cm)"
              value={form.heightCm}
              onChange={(e) => setForm((prev) => ({ ...prev, heightCm: e.target.value }))}
            />
            <Input
              type="number"
              min="35"
              max="250"
              step="0.1"
              placeholder="Peso (kg)"
              value={form.weightKg}
              onChange={(e) => setForm((prev) => ({ ...prev, weightKg: e.target.value }))}
            />
            {healthSystem === "isapre" ? (
              <>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
            <SearchableSelect
              value={form.bankCode}
              options={CHILE_BANKS.map((bank) => ({ id: bank.code, label: bank.name }))}
              placeholder="Banco *"
              emptyText="Sin bancos"
              onChange={(id) => setForm((prev) => ({ ...prev, bankCode: id }))}
            />
            <select
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {documentTypes.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.required ? "(*) " : ""}
                    {d.label}
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
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                  >
                    <span className="text-sm">
                      {documentTypes.find((d) => d.code === doc.type)?.label ?? doc.type}
                      {doc.fileName ? ` · ${doc.fileName}` : ""}
                    </span>
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
