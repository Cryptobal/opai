import { ModuleSubNav } from "@/components/opai-ds";

export default function RondasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 min-w-0">
      <ModuleSubNav moduleKey="ops-rondas" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
