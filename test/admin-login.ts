import { askAdminMint } from '../src/lib/control';

/**
 * Returns a `Cookie` header value for an administrator session on the in-process `serve()` at
 * `port`, opened the way a browser opens one: a proof minted over the control socket, then the
 * public `POST /api/admin/session` exchange from the minted local origin.
 */
export async function adminLogin(port: number): Promise<string> {
  const minted = await askAdminMint(port);
  if (!minted || 'error' in minted) throw new Error(`admin mint on ${port}: ${minted ? minted.error : 'no daemon'}`);
  const res = await fetch(`${minted.url}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: minted.url, 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({ proof: minted.proof }),
  });
  if (res.status !== 204) throw new Error(`admin exchange on ${port}: ${res.status}`);
  const set = res.headers.get('set-cookie') ?? '';
  return set.slice(0, set.indexOf(';'));
}
