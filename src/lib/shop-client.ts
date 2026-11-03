export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** POST/PATCH/DELETE JSON helper for the storefront (always sends the JSON content type the API requires). */
export async function callJson<T = unknown>(url: string, body?: unknown, method = 'POST'): Promise<JsonResult<T>> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: method === 'DELETE' ? undefined : JSON.stringify(body ?? {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: (data as { error?: string }).error ?? 'Đã có lỗi xảy ra.', status: response.status };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ. Vui lòng thử lại.', status: 0 };
  }
}

/** crypto.randomUUID needs a secure context; plain http on a LAN address does not have one. */
export function newKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
