import { ApiError } from './api';
import type { AutomationState } from './automation-model';
import { VIEWER_DENIED, VIEWER_MESSAGE } from './viewer-text';

/** The automation routes. `base` is empty in the page; a test points it at a fake server. */
async function call<T>(base: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, method === 'GET' ? undefined : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const got = (await res.json().catch(() => null)) as (T & { error?: string; reason?: string }) | null;
  if (!res.ok || !got) {
    const x = got as { error?: unknown; reason?: unknown } | null;
    if (x?.reason === 'viewer') {
      dispatchEvent(new Event(VIEWER_DENIED));
      throw new ApiError(VIEWER_MESSAGE, res.status, 'viewer');
    }
    throw new ApiError(typeof x?.error === 'string' ? x.error : `${res.status} ${res.statusText}`, res.status, typeof x?.reason === 'string' ? x.reason : undefined);
  }
  return got;
}

export const automationApi = (base = '') => ({
  state: (root: string) => call<AutomationState>(base, 'GET', `/api/automation?root=${encodeURIComponent(root)}`),
  approve: (root: string, registration: string, hash: string) => call<{ registration: string; approval: 'approved'; hash: string }>(base, 'POST', '/api/automation/approve', { root, registration, hash }),
  revoke: (root: string, registration: string) => call<{ registration: string; approval: 'none' }>(base, 'POST', '/api/automation/revoke', { root, registration }),
});
