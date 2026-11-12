export const OWNER_TOKEN_STORAGE_KEY = 'zamora_owner_token';

function normalizeApiBase(raw?: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '/api';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export function getStoredOwnerToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(OWNER_TOKEN_STORAGE_KEY);
}

export function setStoredOwnerToken(token?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(OWNER_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
  }
}

export function clearStoredOwnerToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(OWNER_TOKEN_STORAGE_KEY);
}
