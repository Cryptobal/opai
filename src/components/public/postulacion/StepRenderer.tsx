"use client";

import type { PostulacionController } from "./usePostulacionForm";
import { StepDatosPersonales } from "./steps/StepDatosPersonales";
import { StepContacto } from "./steps/StepContacto";
import { StepPrevision } from "./steps/StepPrevision";
import { StepTallas } from "./steps/StepTallas";
import { StepDocumentos } from "./steps/StepDocumentos";

interface Props {
  step: number;
  c: PostulacionController;
  errors: Record<string, string>;
}

export function StepRenderer({ step, c, errors }: Props) {
  if (step === 0) {
    return (
      <StepDatosPersonales
        form={c.form}
        setForm={c.setForm}
        rutError={c.rutError}
        setRutError={c.setRutError}
        errors={errors}
      />
    );
  }
  if (step === 1) {
    return <StepContacto form={c.form} setForm={c.setForm} onAddressChange={c.onAddressChange} errors={errors} />;
  }
  if (step === 2) {
    return (
      <StepPrevision
        form={c.form}
        setForm={c.setForm}
        healthSystem={c.healthSystem}
        setHealthSystem={c.setHealthSystem}
        isapreHasExtraPercent={c.isapreHasExtraPercent}
        setIsapreHasExtraPercent={c.setIsapreHasExtraPercent}
        errors={errors}
      />
    );
  }
  if (step === 3) {
    return <StepTallas form={c.form} setForm={c.setForm} />;
  }
  return (
    <StepDocumentos
      form={c.form}
      setForm={c.setForm}
      documentTypes={c.documentTypes}
      docType={c.docType}
      setDocType={c.setDocType}
      docFileName={c.docFileName}
      setDocFileName={c.setDocFileName}
      uploading={c.uploading}
      uploadedDocs={c.uploadedDocs}
      handleUpload={c.handleUpload}
      removeDoc={c.removeDoc}
      fileInputRef={c.fileInputRef}
      errors={errors}
    />
  );
}
