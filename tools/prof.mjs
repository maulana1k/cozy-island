// Measures the true cost of one frame (limiter off) and where the script time goes, at each check spot.
// Usage, with the dev server running: node tools/prof.mjs [camp|summit|jungle|bridge|village|farm|clifftop|dock|topterrace|clearing]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 9333);
const dir = mkdtempSync(join(tmpdir(), 'prof-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=metal', '--enable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`,
  '--window-size=1512,982', '--force-device-scale-factor=2', '--disable-frame-rate-limit', '--disable-gpu-vsync', 'about:blank',
], { stdio: 'ignore' });
// GUARD: the browser is always closed, even if this script fails or hangs (leftover browsers heat the machine).
const killChrome = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', killChrome); process.on('uncaughtException', (e) => { console.error(String(e)); process.exit(1); }); process.on('unhandledRejection', (e) => { console.error(String(e)); process.exit(1); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(1));
setTimeout(() => { console.error('timed out'); process.exit(1); }, Number(process.env.MAXMS || 240000)).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);
const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waits = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d.result || d.error); waits.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

// The camp and the jungle, then the bigger island's spots (see AREAS in src/config.js): standing on
// the bridge looking at the village, in the village square, on the farm, at the cliff-top lookout
// looking down the river, and on the dock looking back at camp. `village` is the square, `farm` the valley.
const SPOTS = {
  camp: 'x=10&z=8&yaw=0.6', summit: 'x=-18&z=-22&yaw=2', jungle: 'x=-45&z=-50&yaw=3.9',
  bridge: 'x=61.5&z=-25.1&yaw=-1.06', village: 'x=101&z=-55.5&yaw=2.08', farm: 'x=100&z=-98&yaw=1.86', clifftop: 'x=56&z=-133&yaw=2.83', dock: 'x=60.1&z=19.5&yaw=1.26',
  // The hillside (2026-11-16): the top terrace looking down over the village to the bridge, and the ridge clearing looking west.
  topterrace: 'x=118.5&z=-57&yaw=2.2', clearing: 'x=147&z=-79&yaw=1.99',
  // The camp's open sandy beach, looking out to sea over the surf.
  beach: 'x=18&z=46&yaw=-2.77',
  // Performance checks (2026-11-17): a few steps from the camp bonfire looking at it (pair with T=0.95), and
  // the camp looking west into the low sun (pair with T=0.84).
  campfire: 'x=14&z=15&yaw=0.52', sunset: 'x=22&z=10&yaw=1.23',
};
const only = process.argv[2];
for (const [name, q] of Object.entries(SPOTS)) {
  if (only && only !== name) continue;
  await send('Page.navigate', { url: `http://localhost:5173/?play&t=${process.env.T || '0.45'}&${q}&dbg&nolimit${process.argv[3] || ""}` });
  await sleep(6000);
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start');
  const frames = await evalJs(`new Promise((res) => { const t = []; let last = performance.now(); const f = () => { const n = performance.now(); t.push(n - last); last = n; if (t.length < 400) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res({ median: t[200], p95: t[380] }); } }; requestAnimationFrame(f); })`);
  const { profile } = await send('Profiler.stop');
  const title = await evalJs('document.title');
  const size = await evalJs('JSON.stringify([innerWidth, innerHeight, devicePixelRatio, document.querySelector("canvas").width, document.querySelector("canvas").height])');
  // Self time per function, and idle share.
  const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dts = profile.timeDeltas; let total = 0;
  profile.samples.forEach((s, i) => { const n = byId.get(s), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().split('?')[0]}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dts[i]); total += dts[i]; });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `    ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
  console.log(`\n== ${name}  frame median ${frames.median.toFixed(2)} ms (${(1000 / frames.median).toFixed(0)} fps uncapped), p95 ${frames.p95.toFixed(2)} ms  ${title}  window ${size}`);
  console.log(top.join('\n'));
}
ws.close(); chrome.kill();
