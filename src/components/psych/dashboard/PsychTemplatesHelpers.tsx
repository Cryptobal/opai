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
        <span className="font-medium text-slate-700">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function TemplatePreview({ value }: { value: string }) {
  const resolved = resolveMessageTokens(value, TEMPLATE_PREVIEW_CTX);
  return (
    <div className="text-xs bg-slate-900 text-slate-100 rounded-md p-2 whitespace-pre-wrap">
      {resolved || <span className="text-slate-500">(preview)</span>}
    </div>
  );
}
