/**
 * Skeleton del home de Productividad — tres tarjetas con altura estable.
 */
export default function ProductividadInicioLoading() {
  return (
    <div className="flex min-w-0 flex-col gap-5 p-1">
      <div className="space-y-3">
        <div className="h-5 w-24 rounded-md bg-ds-surface-2" />
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-40 rounded-2xl bg-ds-surface-2" />
          <div className="h-40 rounded-2xl bg-ds-surface-2" />
          <div className="h-48 rounded-2xl bg-ds-surface-2 lg:col-span-2" />
        </div>
      </div>
    </div>
  );
}
