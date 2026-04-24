"use client";

import { resolveMessageTokens } from "@/lib/psych/resolveMessageTokens";

export const TEMPLATE_PREVIEW_CTX = {
  nombre: "Juan Pérez",
  link: "https://opai.cl/t/psicotest/eyJhbGci…",
  expira: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  tenant: "Gard Security",
};

export function TemplateField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-foreground/90">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function TemplatePreview({ value }: { value: string }) {
  const resolved = resolveMessageTokens(value, TEMPLATE_PREVIEW_CTX);
  return (
    <div className="text-xs bg-muted text-foreground/90 rounded-md p-2 whitespace-pre-wrap border border-border">
      {resolved || <span className="text-muted-foreground">(preview)</span>}
    </div>
  );
}
