"use client";

import React from "react";

interface MetricCardProps {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  color?: string;
}

export default function MetricCard({
  value,
  label,
  icon,
  color = "#06B6D4",
}: MetricCardProps) {
  return (
    <div
      className="rounded-xl border border-gray-800 bg-[#111827] p-4 flex flex-col gap-1"
    >
      <div className="flex items-center justify-between">
        <span
          className="text-3xl font-bold tracking-tight"
          style={{ color }}
        >
          {value}
        </span>
        {icon && (
          <span className="text-gray-400" style={{ color }}>
            {icon}
          </span>
        )}
      </div>
      <span className="text-sm font-medium text-gray-400 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}
