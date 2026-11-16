// Starts one headless Chrome with remote debugging and always closes it again, even if the caller
// fails or hangs (a leftover browser keeps rendering the game and heats the machine).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function openBrowser({ port = Number(process.env.PORT || 9333), width = 1512, height = 982, scale = 2, extra = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cozy-chrome-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--use-angle=metal', '--enable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`, ...extra, 'about:blank',
  ], { stdio: 'ignore' });
  const kill = () => { try { chrome.kill('SIGKILL'); } catch { /* already gone */ } };
  process.on('exit', kill);
  process.on('uncaughtException', (e) => { console.error(String(e)); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error(String(e)); process.exit(1); });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(1));
  setTimeout(() => { console.error('timed out'); process.exit(1); }, Number(process.env.MAXMS || 240000)).unref();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let tabs = null;
  for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* not up yet */ } }
  if (!tabs) throw new Error(`Chrome did not start on port ${port} (is another one using it?)`);
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const waits = new Map(), errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d.result || d.error); waits.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.value ?? r; };
  const shot = async (file) => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72 }); writeFileSync(file, Buffer.from(s.data, 'base64')); };
  const close = () => { try { ws.close(); } catch { /* fine */ } kill(); };
  return { send, evaluate, shot, sleep, errors, close };
}
