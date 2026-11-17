import { ApiError } from './api';
import { VIEWER_DENIED, VIEWER_MESSAGE } from './viewer-text';
import type { FlowCatalog, FlowEventRequest, FlowEventResult, FlowPreview, FlowRange, FlowStarted, FlowSubject } from './flow-model';

/** A refused flow request: the reason, plus `why` for a missing baseline and `run` for an open run. */
export class FlowApiError extends ApiError {
  constructor(message: string, status: number, reason?: string, readonly why?: string, readonly run?: { url: string; status: string }) {
    super(message, status, reason);
  }
}

/** The flow routes. `base` is empty in the page; a test points it at a fake server. */
async function call<T>(base: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, method === 'GET' ? undefined : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const got = (await res.json().catch(() => null)) as (T & { error?: string; reason?: string }) | null;
  if (!res.ok || !got) {
    const x = got as { error?: unknown; reason?: unknown; why?: unknown; run?: { url: string; status: string } } | null;
    // A stale tab that still shows a control: the app re-reads the mode, and the words are the Viewer's.
    if (x?.reason === 'viewer') {
      dispatchEvent(new Event(VIEWER_DENIED));
      throw new FlowApiError(VIEWER_MESSAGE, res.status, 'viewer');
    }
    throw new FlowApiError(typeof x?.error === 'string' ? x.error : `${res.status} ${res.statusText}`, res.status, typeof x?.reason === 'string' ? x.reason : undefined, typeof x?.why === 'string' ? x.why : undefined, x?.run);
  }
  return got;
}

export const flowApi = (base = '') => ({
  catalog: (root: string) => call<FlowCatalog>(base, 'GET', `/api/flow/catalog?root=${encodeURIComponent(root)}`),
  preview: (rootId: string, packageId: string, range: FlowRange, subject?: FlowSubject) => call<FlowPreview>(base, 'POST', '/api/flow/preview', { rootId, packageId, range, ...(subject ? { subject } : {}) }),
  start: (token: string) => call<FlowStarted>(base, 'POST', '/api/flow/start', { token }),
  event: (req: FlowEventRequest) => call<FlowEventResult>(base, 'POST', '/api/flow/event', req),
});
