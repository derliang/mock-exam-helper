// 最小 CDP 客戶端（Node 24 內建 WebSocket）。只給本機驗收截圖用。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

export async function launchChrome(port, profile) {
  profile = profile + '-' + Date.now();
  mkdirSync(profile, { recursive: true });
  const exe = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return { proc, ws: (await r.json()).webSocketDebuggerUrl }; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('chrome 沒啟動');
}

export class Browser {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); }
  async open() {
    this.sock = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.sock.onopen = res; this.sock.onerror = rej; });
    this.sock.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { const p = this.pending.get(d.id); this.pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP逾時 ' + method)); } }, 25000); });
  }
  async newPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    return new Page(this, sessionId, targetId);
  }
  close() { try { this.sock.close(); } catch {} }
}

export class Page {
  constructor(b, sid, tid) { this.b = b; this.sid = sid; this.tid = tid; }
  cmd(m, p) { return this.b.send(m, p, this.sid); }
  async ev(expr) {
    const r = await this.cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('ev 失敗：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n' + expr.slice(0, 200));
    return r.result.value;
  }
  async setup(width, height, dark) {
    await this.cmd('Page.enable');
    await this.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await this.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  }
  async goto(url) {
    await this.cmd('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 700));
    for (let i = 0; i < 40; i++) { if ((await this.ev('document.readyState')) === 'complete') break; await new Promise((r) => setTimeout(r, 150)); }
  }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  async shot(fmt = 'png', quality = 60) {
    const h = await this.ev('Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))');
    const w = await this.ev('document.documentElement.clientWidth');
    await this.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: Math.min(h, 9000), deviceScaleFactor: 1, mobile: w < 500 });
    await this.sleep(250);
    await this.cmd('Page.bringToFront'); const r = await this.cmd('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality } : {}) });
    return r.data;
  }
  async clickText(text, sel = 'button,a,[role=button],[role=tab]') {
    const expr = `(()=>{const t=${JSON.stringify(text)};const els=[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e=>e.offsetParent!==null&&!e.disabled);
      let e=els.find(x=>x.textContent.trim().replace(/\s+/g,' ')===t)||els.find(x=>x.textContent.trim().replace(/\s+/g,' ').startsWith(t))||els.find(x=>x.textContent.includes(t));
      if(!e)return false;e.scrollIntoView({block:'center'});e.click();return true})()`;
    for (let i = 0; i < 25; i++) {
      if (await this.ev(expr)) { await this.sleep(350); return; }
      await this.sleep(300);
    }
    throw new Error('找不到可點的：' + text);
  }
}
