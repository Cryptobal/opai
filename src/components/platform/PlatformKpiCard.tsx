interface PlatformKpiCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  warning?: boolean;
}

export function PlatformKpiCard({ label, value, trend, warning }: PlatformKpiCardProps) {
  return (
    <div
      className={`rounded-xl border bg-white p-6 shadow-sm ${
        warning ? 'border-amber-200 bg-amber-50' : 'border-gray-200'
      }`}
    >
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {trend && (
        <div
          className={`mt-2 text-sm font-medium ${
            trend.positive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {trend.value}
        </div>
      )}
    </div>
  );
}
