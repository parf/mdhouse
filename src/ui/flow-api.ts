import { ApiError } from './api';
import type { FlowCatalog, FlowEventRequest, FlowEventResult, FlowPreview, FlowRange, FlowStarted } from './flow-model';

/** The flow routes. `base` is empty in the page; a test points it at a fake server. */
async function call<T>(base: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, method === 'GET' ? undefined : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const got = (await res.json().catch(() => null)) as (T & { error?: string; reason?: string }) | null;
  if (!res.ok || !got) {
    throw new ApiError(typeof got?.error === 'string' ? got.error : `${res.status} ${res.statusText}`, res.status, typeof got?.reason === 'string' ? got.reason : undefined);
  }
  return got;
}

export const flowApi = (base = '') => ({
  catalog: (root: string) => call<FlowCatalog>(base, 'GET', `/api/flow/catalog?root=${encodeURIComponent(root)}`),
  preview: (rootId: string, packageId: string, range: FlowRange) => call<FlowPreview>(base, 'POST', '/api/flow/preview', { rootId, packageId, range }),
  start: (token: string) => call<FlowStarted>(base, 'POST', '/api/flow/start', { token }),
  event: (req: FlowEventRequest) => call<FlowEventResult>(base, 'POST', '/api/flow/event', req),
});
