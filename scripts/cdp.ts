// bun scripts/cdp.ts <url> <out-prefix> [w,h] [light|dark] 'step'… — Chrome on :9333; a step is JS, `key:a`,
// `key:ctrl+Enter`, `key:alt+1` or `wait:<ms>`; each runs, waits 800 ms, saves <out-prefix>-<i>.png
const [url, out, size = '1280,900', scheme = 'light', ...steps] = process.argv.slice(2);
const [w, h] = size.split(',').map(Number);
const tab = await (await fetch(`http://127.0.0.1:9333/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data as string);
  if (m.id && pending.has(m.id)) pending.get(m.id)!(m.result ?? m.error);
};
const send = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await send('Page.navigate', { url });
await Bun.sleep(2000);
const shot = async (i: number) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await Bun.write(`${out}-${i}.png`, Buffer.from(r.data, 'base64'));
};
await shot(0);
for (let i = 0; i < steps.length; i++) {
  const step = steps[i]!;
  if (step.startsWith('key:')) {
    // key:a  key:ctrl+Enter
    const [mods, key] = step.slice(4).includes('+') ? step.slice(4).split('+') : ['', step.slice(4)];
    const modifiers = mods === 'ctrl' ? 2 : mods === 'alt' ? 1 : 0;
    const code = key === 'Enter' ? 'Enter' : /^\d$/.test(key!) ? `Digit${key}` : `Key${key!.toUpperCase()}`;
    const text = key === 'Enter' ? '\r' : modifiers ? '' : key;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, text, windowsVirtualKeyCode: key === 'Enter' ? 13 : key!.toUpperCase().charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  } else if (step.startsWith('wait:')) {
    await Bun.sleep(Number(step.slice(5)));
  } else {
    const r = await send('Runtime.evaluate', { expression: step, awaitPromise: true, returnByValue: true });
    if (r?.result?.value !== undefined) console.log(i + 1, JSON.stringify(r.result.value));
    if (r?.exceptionDetails) console.log(i + 1, 'ERR', r.exceptionDetails.exception?.description);
  }
  await Bun.sleep(800);
  await shot(i + 1);
}
await fetch(`http://127.0.0.1:9333/json/close/${tab.id}`);
process.exit(0);
