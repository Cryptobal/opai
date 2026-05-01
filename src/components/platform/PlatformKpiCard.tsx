interface PlatformKpiCardProps {
  label: string;
  value: string | number;
  trend?: { value: string; positive: boolean };
  warning?: boolean;
}

export function PlatformKpiCard({ label, value, trend, warning }: PlatformKpiCardProps) {
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-sm ${
        warning ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950' : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      {trend && (
        <div
          className={`mt-2 text-sm font-medium ${
            trend.positive ? 'text-status-ok-fg' : 'text-status-danger-fg'
          }`}
        >
          {trend.value}
        </div>
      )}
    </div>
  );
}
