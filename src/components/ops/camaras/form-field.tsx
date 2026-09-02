import { Label } from "@/components/ui/label";

export function CamaraField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px] uppercase tracking-wide text-ds-text-3">{label}</Label>
      {children}
    </div>
  );
}
