export function formatKsh(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  return `KSh ${num.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function generateIdempotencyKey(prefix = 'idem'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

