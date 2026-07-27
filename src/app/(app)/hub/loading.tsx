export default function HubLoading() {
  return (
    <div className="min-w-0 space-y-5 p-1">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-9 w-24 rounded-full bg-ds-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-40 rounded-2xl bg-ds-surface-2" />
        <div className="h-40 rounded-2xl bg-ds-surface-2" />
      </div>
      <div className="h-48 rounded-2xl bg-ds-surface-2" />
      <div className="h-56 rounded-2xl bg-ds-surface-2" />
    </div>
  );
}
