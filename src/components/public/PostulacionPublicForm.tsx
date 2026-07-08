"use client";

import { PostulacionWizard } from "@/components/public/postulacion/PostulacionWizard";

interface PostulacionPublicFormProps {
  token: string;
  tenantSlug: string;
}

export function PostulacionPublicForm({ token, tenantSlug }: PostulacionPublicFormProps) {
  return <PostulacionWizard token={token} tenantSlug={tenantSlug} />;
}
