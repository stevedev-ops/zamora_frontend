import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'default' | 'emerald' | 'rose' | 'amber' | 'navy';
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
}: StatCardProps) {
  const toneClasses = {
    default: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    navy: 'bg-slate-900 text-white',
  };

  const valueClasses = {
    default: 'text-slate-900',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    navy: 'text-slate-900',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
          <p className={`mt-1.5 text-xl font-bold tabular-nums truncate ${valueClasses[tone]}`}>
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`rounded-lg p-2.5 shrink-0 ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

