"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  completeRutWithDv,
  DEFAULT_POSTULACION_DOCUMENTS,
  isChileanRutFormat,
  isValidChileanRut,
} from "@/lib/personas";
import type { AddressResult } from "@/components/ui/AddressAutocomplete";
import { buildPostulacionPayload } from "./buildPayload";
import { EMPTY_FORM, type DocTypeConfig, type PostulacionForm, type UploadedDoc } from "./types";

interface Args {
  token: string;
  tenantSlug: string;
}

export function usePostulacionForm({ token, tenantSlug }: Args) {
  const [documentTypes, setDocumentTypes] = useState<DocTypeConfig[]>(DEFAULT_POSTULACION_DOCUMENTS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [docType, setDocType] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [healthSystem, setHealthSystem] = useState("fonasa");
  const [isapreHasExtraPercent, setIsapreHasExtraPercent] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<PostulacionForm>(EMPTY_FORM);
  const [rutError, setRutError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from Google OAuth pending registration
  useEffect(() => {
    fetch("/api/portal/guardia/auth/google/pending-data")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.googleData) {
          const nameParts = (data.googleData.name || "").split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";
          setForm((prev) => ({
            ...prev,
            firstName: prev.firstName || firstName,
            lastName: prev.lastName || lastName,
            email: prev.email || data.googleData.googleEmail || "",
          }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/${tenantSlug}/postulacion/document-types?token=${encodeURIComponent(token)}`)
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
    return () => {
      mounted = false;
    };
  }, [token, tenantSlug]);

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
      body.append("token", token);
      body.append("file", file);
      const response = await fetch(`/api/public/${tenantSlug}/postulacion/upload`, {
        method: "POST",
        body,
      });
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
