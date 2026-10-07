export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: any,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let workspaceId: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const setWorkspaceId = (id: string | null) => {
  workspaceId = id;
};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

/** Mevcut çalışma alanına göre yol üretir: ws('/posts') → /workspaces/<id>/posts */
export const ws = (path: string) => {
  if (!workspaceId) throw new Error('Çalışma alanı seçilmedi');
  return `/workspaces/${workspaceId}${path}`;
};

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch('/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = await res.json();
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

interface Opts {
  method?: string;
  body?: unknown;
  form?: FormData;
}

export async function api<T = any>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`/v1${path}`, {
    method: opts.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) return api<T>(path, opts, true);
    onSessionExpired?.();
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (data && (Array.isArray(data.message) ? data.message[0] : data.message)) || `İstek başarısız (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

const safeJson = (t: string) => {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
};

/** İlerleme bilgisiyle dosya yükleme (fetch ilerleme vermediği için XHR). */
export function uploadFile<T>(path: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
  const send = () =>
    new Promise<{ status: number; body: any }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/v1${path}`);
      xhr.withCredentials = true;
      if (accessToken) xhr.setRequestHeader('authorization', `Bearer ${accessToken}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText ? safeJson(xhr.responseText) : null });
      xhr.onerror = () => reject(new ApiError('Yükleme sırasında ağ hatası', 0, null));
      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });

  return (async () => {
    let r = await send();
    if (r.status === 401 && (await refreshAccessToken())) r = await send();
    if (r.status >= 400) throw new ApiError(r.body?.message ?? 'Yükleme başarısız', r.status, r.body);
    return r.body as T;
  })();
}
