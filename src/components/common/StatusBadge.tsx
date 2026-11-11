type BadgeVariant = 'emerald' | 'rose' | 'amber' | 'slate' | 'blue';

const VARIANT_MAP: Record<BadgeVariant, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200',
};

export function StatusBadge({
  label,
  variant = 'slate',
}: {
  label: string;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANT_MAP[variant]}`}
    >
      {label}
    </span>
  );
}

