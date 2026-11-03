export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** fetch + JSON for admin screens. A 401 sends the user back to the login page. */
export async function callApi<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, json === undefined ? rest : { ...rest, method: rest.method ?? 'POST', headers: { 'content-type': 'application/json', ...rest.headers }, body: JSON.stringify(json) });
  if (response.status === 401) {
    // A full reload (not router.push) also drops any stale client state of the expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/admin/login');
    return { ok: false, error: 'Phiên đăng nhập đã hết hạn.', status: 401 };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: (data as { error?: string }).error ?? 'Đã có lỗi xảy ra.', status: response.status };
  return { ok: true, data: data as T };
}
