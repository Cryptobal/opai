export default function InventarioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tabs de Inventario en la barra superior (AppShell).
  return <div className="min-w-0">{children}</div>;
}
