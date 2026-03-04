export default function DescargarLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#0a0a0f]">{children}</body>
    </html>
  );
}
