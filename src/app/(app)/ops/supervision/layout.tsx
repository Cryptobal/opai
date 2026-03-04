import { SupervisionSubnav } from "@/components/supervision/SupervisionSubnav";

export default function SupervisionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4 min-w-0">
      <SupervisionSubnav />
      {children}
    </div>
  );
}
