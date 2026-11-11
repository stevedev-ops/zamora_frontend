import { Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-slate-700 mb-3" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

