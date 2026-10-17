/** localStorage erişimi kapalı olabilir (gizli pencere vb.); okuma ve yazma hiçbir zaman hata fırlatmaz. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* yok say */
  }
}
