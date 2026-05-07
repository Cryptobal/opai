import Link from "next/link";
import { Plus } from "lucide-react";
import { ModuleSubNav } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

export default function SupervisionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 min-w-0">
      <ModuleSubNav
        moduleKey="ops-supervision"
        trailingAction={
          <Button asChild size="sm" className="hidden lg:inline-flex shrink-0 gap-1.5">
            <Link href="/ops/supervision/nueva-visita">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva visita</span>
            </Link>
          </Button>
        }
      />
      {children}
    </div>
  );
}
