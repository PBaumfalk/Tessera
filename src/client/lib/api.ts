// Zugriff auf die Tessera-API mit verständlichen Fehlermeldungen.
export class ApiError extends Error {
  constructor(public status: number, message: string, public field?: string, public data?: any) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    const type = res.headers.get('content-type') ?? '';
    return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
  }
  let body: any = null;
  try { body = await res.json(); } catch { /* keine JSON-Antwort */ }
  const msg = body?.error?.message ?? (res.status === 401 ? 'Bitte melde dich an.' : res.status >= 500 ? 'Der Server hat einen Fehler gemeldet. Bitte versuche es noch einmal.' : 'Das hat nicht geklappt.');
  if (res.status === 401 && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/setup')) {
    window.dispatchEvent(new CustomEvent('tessera:unauthorized'));
  }
  throw new ApiError(res.status, msg, body?.error?.field, body?.error);
}

function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'x-tessera': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => handle<T>(r), () => { throw new ApiError(0, 'Keine Verbindung zum Server. Prüfe dein Netzwerk.'); });
}

export const api = {
  get: <T>(url: string) => req<T>('GET', url),
  post: <T>(url: string, body?: unknown) => req<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body: unknown) => req<T>('PATCH', url, body),
  del: <T>(url: string) => req<T>('DELETE', url),
  /** Liefert eine Datei (Blob) samt Dateiname aus Content-Disposition. */
  async file(url: string, body?: unknown): Promise<{ blob: Blob; name: string; skipped?: string }> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: body !== undefined ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: { 'x-tessera': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, 'Keine Verbindung zum Server. Prüfe dein Netzwerk.');
    }
    if (!res.ok) await handle(res);
    const cd = res.headers.get('content-disposition') ?? '';
    const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(cd)?.[1] ?? /filename="([^"]+)"/.exec(cd)?.[1] ?? 'download');
    const skipped = res.headers.get('x-tessera-skipped');
    return { blob: await res.blob(), name, skipped: skipped ? decodeURIComponent(skipped) : undefined };
  },
  async upload<T>(url: string, file: File): Promise<T> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(url, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-tessera': '1' } });
    return handle<T>(res);
  },
};

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
