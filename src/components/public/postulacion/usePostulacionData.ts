"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_POSTULACION_DOCUMENTS } from "@/lib/personas";
import type { DocTypeConfig, PostulacionForm } from "./types";

interface Args {
  token: string;
  tenantSlug: string;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
}

/**
 * Carga los datos externos del formulario: pre-fill desde el registro OAuth de
 * Google pendiente y los tipos de documento configurados por el tenant.
 * Extraído del componente para mantener PostulacionWizard delgado.
 */
export function usePostulacionData({ token, tenantSlug, setForm }: Args) {
  const [documentTypes, setDocumentTypes] = useState<DocTypeConfig[]>(DEFAULT_POSTULACION_DOCUMENTS);
  const [docType, setDocType] = useState("");

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
  }, [setForm]);

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

  return { documentTypes, docType, setDocType };
}
