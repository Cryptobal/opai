"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { completeRutWithDv } from "@/lib/personas";
import type { AddressResult } from "@/components/ui/AddressAutocomplete";
import { buildPostulacionPayload } from "./buildPayload";
import { usePostulacionData } from "./usePostulacionData";
import { validateSubmit } from "./wizard-validation";
import { EMPTY_FORM, type PostulacionForm, type UploadedDoc } from "./types";

export function usePostulacionForm({ token, tenantSlug }: { token: string; tenantSlug: string }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docFileName, setDocFileName] = useState("");
  const [healthSystem, setHealthSystem] = useState("fonasa");
  const [isapreHasExtraPercent, setIsapreHasExtraPercent] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<PostulacionForm>(EMPTY_FORM);
  const [rutError, setRutError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { documentTypes, docType, setDocType } = usePostulacionData({ token, tenantSlug, setForm });

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
      const response = await fetch(`/api/public/${tenantSlug}/postulacion/upload`, { method: "POST", body });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo subir el archivo");
      }
      setUploadedDocs((prev) => [
        { id: crypto.randomUUID(), type: docType, fileUrl: payload.data.url, fileName: file.name },
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
    const ctx = { healthSystem, isapreHasExtraPercent, uploadedDocs, documentTypes };
    const validationError = validateSubmit(form, ctx);
    if (validationError) {
      if (validationError.field === "rut") {
        setRutError("RUT inválido. Verifica guión y dígito verificador.");
      }
      toast.error(validationError.message);
      return;
    }
    const completedRut = completeRutWithDv(form.rut);
    setForm((prev) => ({ ...prev, rut: completedRut }));
    setRutError(null);

    setSaving(true);
    try {
      const response = await fetch(`/api/public/${tenantSlug}/postulacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPostulacionPayload({ token, form, completedRut, healthSystem, isapreHasExtraPercent, uploadedDocs }),
        ),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar la postulación");
      }
      toast.success("Postulación enviada correctamente");
      setSubmitSuccessMessage(
        "Formulario enviado correctamente. Gracias, nuestro equipo revisará tu postulación y te contactará pronto.",
      );
      setForm(EMPTY_FORM);
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

  return {
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
  };
}

export type PostulacionController = ReturnType<typeof usePostulacionForm>;
