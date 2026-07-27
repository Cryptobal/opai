/**
 * Fallback del segmento `(app)` — solo contenido (el shell ya lo pinta el layout).
 * Reserva una franja superior equivalente a `SurfaceReturnBar` para evitar
 * salto de layout cuando la superficie activa es `productividad`.
 */
export default function AppLoading() {
  return (
    <div className="min-w-0 space-y-4">
      {/* Reserva SurfaceReturnBar (~44px + mb-2) */}
      <div className="h-11 w-full max-w-xs rounded-lg bg-ds-surface-2" aria-hidden />
      <div className="h-8 w-48 rounded bg-ds-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-ds-surface-2" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-ds-surface-2" />
    </div>
  );
}
