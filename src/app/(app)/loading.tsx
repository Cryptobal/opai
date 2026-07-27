/**
 * Esqueleto del shell ERP — permite a Next emitir HTML apenas resuelve el layout.
 * Sin animate-pulse en la primera pintura (evita coste de layout en cold start).
 */
export default function AppLoading() {
  return (
    <div className="min-h-[100dvh] bg-ds-surface-0 text-ds-text-1">
      <div className="hidden lg:flex h-14 items-center gap-3 border-b border-ds-border-subtle px-4">
        <div className="h-8 w-8 rounded-lg bg-ds-surface-2" />
        <div className="h-4 w-28 rounded bg-ds-surface-2" />
        <div className="ml-auto h-8 w-40 rounded-full bg-ds-surface-2" />
      </div>
      <div className="flex">
        <aside className="hidden xl:block w-[72px] shrink-0 border-r border-ds-border-subtle min-h-[calc(100dvh-3.5rem)] p-3 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-10 w-10 rounded-xl bg-ds-surface-2 mx-auto" />
          ))}
        </aside>
        <main className="flex-1 p-4 space-y-4">
          <div className="h-8 w-48 rounded bg-ds-surface-2" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-ds-surface-2" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-ds-surface-2" />
        </main>
      </div>
    </div>
  );
}
