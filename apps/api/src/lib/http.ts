/**
 * Platform API çağrıları için küçük fetch yardımcısı.
 * Hata durumunda ProviderError fırlatır; 429 ve 5xx yeniden denenebilir sayılır.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly opts: {
      retryable: boolean;
      code?: string;
      status?: number;
      body?: unknown;
      /** true ise hesap yeniden bağlanmalı (token geçersiz) */
      reauth?: boolean;
    },
  ) {
    super(message);
    this.name = 'ProviderError';
  }
  get retryable() {
    return this.opts.retryable;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  body?: BodyInit;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export interface HttpResult<T> {
  status: number;
  headers: Headers;
  data: T;
}

export async function httpRequest<T = any>(url: string, opts: RequestOptions = {}): Promise<HttpResult<T>> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) u.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json; charset=UTF-8';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form).toString();
  }

  let res: Response;
  try {
    res = await fetch(u, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (err) {
    throw new ProviderError(`Ağ hatası: ${(err as Error).message}`, { retryable: true, code: 'network' });
  }

  const text = await res.text();
  let data: any = text;
  if (text && (res.headers.get('content-type') ?? '').includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      /* metin olarak bırak */
    }
  }

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    const reauth = res.status === 401;
    throw new ProviderError(extractMessage(data) ?? `HTTP ${res.status}`, {
      retryable,
      reauth,
      status: res.status,
      body: data,
      code: `http_${res.status}`,
    });
  }
  return { status: res.status, headers: res.headers, data: data as T };
}

function extractMessage(data: any): string | undefined {
  if (!data || typeof data !== 'object') return typeof data === 'string' && data.length < 500 ? data : undefined;
  return (
    data.error?.message ??
    data.error?.error_user_msg ??
    data.error_description ??
    data.message ??
    (typeof data.error === 'string' ? data.error : undefined)
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
