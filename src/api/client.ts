import {
  apiUrl,
  clearStoredOwnerToken,
  getStoredOwnerToken,
} from './config';
import {
  cacheDelete,
  cacheGet,
  cacheSet,
} from '../offline/offlineDb';
import {
  classifyMutation,
  flushOutbox,
  isOfflineNetworkError,
  queueOfflineMutation,
} from '../offline/syncManager';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 400, code = 'ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let payload: { error?: { message?: string; code?: string; details?: unknown } } | null = null;
    try {
      payload = await resp.json();
    } catch {
      // ignore non-json error bodies
    }
    throw new ApiError(
      payload?.error?.message || `Request failed (${resp.status})`,
      resp.status,
      payload?.error?.code || 'HTTP_ERROR',
      payload?.error?.details
    );
  }
  return resp.json() as Promise<T>;
}

function makeCacheKey(path: string, portalSession?: string) {
  if (portalSession && path.startsWith('/portal/')) {
    return `GET:${path}::ps=${portalSession.slice(-16)}`;
  }
  return `GET:${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { portalSession?: string; skipOfflineQueue?: boolean } = {}
): Promise<T> {
  const { portalSession, headers, skipOfflineQueue, ...rest } = options;
  const method = (rest.method || 'GET').toUpperCase();

  // Handle logout cache clearing cleanly
  if (method === 'POST' && path === '/auth/logout') {
    await cacheDelete('GET:/auth/me');
  }

  // If browser reports offline and this is a queued mutation kind, queue immediately without waiting for timeout
  const mutationKind = !skipOfflineQueue ? classifyMutation(method, path) : null;
  if (
    mutationKind &&
    (method === 'POST' || method === 'PATCH' || method === 'DELETE') &&
    typeof navigator !== 'undefined' &&
    !navigator.onLine
  ) {
    const parsedBody =
      typeof rest.body === 'string' && rest.body
        ? (JSON.parse(rest.body) as Record<string, unknown>)
        : {};
    return queueOfflineMutation<T>(mutationKind, method, path, parsedBody);
  }

  // If offline and GET request has cached data, serve immediately from IndexedDB
  if (method === 'GET' && typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await cacheGet<T>(makeCacheKey(path, portalSession));
    if (cached) {
      return cached.data;
    }
  }

  try {
    const isPortalPath = path.startsWith('/portal/');
    const ownerToken = !portalSession && !isPortalPath ? getStoredOwnerToken() : null;
    const resp = await fetch(apiUrl(path), {
      ...rest,
      credentials: 'include',
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}),
        ...(portalSession ? { 'x-portal-session': portalSession } : {}),
        ...headers,
      },
    });

    if (!portalSession && !isPortalPath && resp.status === 401) {
      clearStoredOwnerToken();
      if (method === 'GET' && path === '/auth/me') {
        await cacheDelete('GET:/auth/me');
      }
    }

    const data = await handleResponse<T>(resp);

    // Cache successful GET responses for offline usage
    if (method === 'GET') {
      await cacheSet(makeCacheKey(path, portalSession), data);
    }

    // If back online and this was a POST/PATCH, opportunistically trigger background outbox check
    if (method !== 'GET' && typeof navigator !== 'undefined' && navigator.onLine) {
      void flushOutbox();
    }

    return data;
  } catch (err) {
    if (!isOfflineNetworkError(err)) {
      throw err;
    }

    // Fallback to IndexedDB cache on network errors for GET requests
    if (method === 'GET') {
      const cached = await cacheGet<T>(makeCacheKey(path, portalSession));
      if (cached) {
        return cached.data;
      }
      throw new ApiError('You are offline and this screen has not been cached yet.', 0, 'OFFLINE');
    }

    // Queue supported POST/PATCH/DELETE mutations cleanly
    if (mutationKind && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
      const parsedBody =
        typeof rest.body === 'string' && rest.body
          ? (JSON.parse(rest.body) as Record<string, unknown>)
          : {};
      return queueOfflineMutation<T>(mutationKind, method, path, parsedBody);
    }

    throw new ApiError(
      'No internet connection. Please reconnect and try again.',
      0,
      'OFFLINE'
    );
  }
}

export const api = {
  get: <T>(path: string, portalSession?: string) =>
    apiRequest<T>(path, { method: 'GET', portalSession }),
  post: <T>(path: string, body?: unknown, portalSession?: string) =>
    apiRequest<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      portalSession,
    }),
  patch: <T>(path: string, body?: unknown, portalSession?: string) =>
    apiRequest<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      portalSession,
    }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export async function downloadBinaryFile(
  path: string,
  filename: string,
  portalSession?: string
): Promise<void> {
  const isPortalPath = path.startsWith('/portal/');
  const ownerToken = !portalSession && !isPortalPath ? getStoredOwnerToken() : null;
  const headers: Record<string, string> = {};
  if (ownerToken) headers.Authorization = `Bearer ${ownerToken}`;
  if (portalSession) headers['x-portal-session'] = portalSession;

  const resp = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!resp.ok) {
    throw new ApiError('Failed to download file', resp.status);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
