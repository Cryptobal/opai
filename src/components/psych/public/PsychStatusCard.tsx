"use client";

interface Props {
  icon?: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

export default function PsychStatusCard({ icon, message, action }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
        {icon ? <div className="text-4xl mb-3">{icon}</div> : null}
        <p className="text-slate-700 mb-4">{message}</p>
        {action ? (
          <button
            onClick={action.onClick}
            className="rounded-xl px-4 py-3 bg-slate-900 text-white"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
