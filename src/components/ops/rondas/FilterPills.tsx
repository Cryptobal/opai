import { cn } from "@/lib/utils";

interface FilterPill {
  id: string;
  label: string;
  count?: number;
}

interface FilterPillsProps {
  pills: FilterPill[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function FilterPills({ pills, value, onChange, className }: FilterPillsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {pills.map((pill) => {
        const active = value === pill.id;
        return (
          <button
            key={pill.id}
            onClick={() => onChange(pill.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all",
              active
                ? "bg-[#2dd4bf]/15 border-[#2dd4bf]/40 text-[#2dd4bf]"
                : "bg-white/5 border-white/10 text-[#94a3b8] hover:border-white/20 hover:text-[#f1f5f9]"
            )}
          >
            {pill.label}
            {pill.count !== undefined && (
              <span className={cn(
                "rounded-full px-1 min-w-[16px] text-center",
                active ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" : "bg-white/10 text-[#64748b]"
              )}>
                {pill.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
