"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { FilePlus2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocTypeConfig, PostulacionForm, UploadedDoc } from "../types";
import { CONTROL_H, FieldError, WizardSelect } from "../fields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
  documentTypes: DocTypeConfig[];
  docType: string;
  setDocType: (value: string) => void;
  docFileName: string;
  setDocFileName: (value: string) => void;
  uploading: boolean;
  uploadedDocs: UploadedDoc[];
  handleUpload: (file?: File | null) => void;
  removeDoc: (id: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  errors: Record<string, string>;
}

export function StepDocumentos({
  form,
  setForm,
  documentTypes,
  docType,
  setDocType,
  docFileName,
  setDocFileName,
  uploading,
  uploadedDocs,
  handleUpload,
  removeDoc,
  fileInputRef,
  errors,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-medium">Documentos</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <WizardSelect value={docType} onChange={(e) => setDocType(e.target.value)}>
            {documentTypes.map((d) => (
              <option key={d.code} value={d.code}>
                {d.required ? "(*) " : ""}
                {d.label}
              </option>
            ))}
          </WizardSelect>
          <Button
            type="button"
            variant="outline"
            className={CONTROL_H}
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
            className={CONTROL_H}
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
        <FieldError message={errors.documents} />
      </div>

      <Input
        className={CONTROL_H}
        placeholder="Notas o comentarios (opcional)"
        value={form.notes}
        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
      />
    </div>
  );
}
