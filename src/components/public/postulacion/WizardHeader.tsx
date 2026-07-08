"use client";

import { useBranding } from "@/lib/branding/useBranding";

export function WizardHeader() {
  const { branding } = useBranding();
  return (
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
  );
}
