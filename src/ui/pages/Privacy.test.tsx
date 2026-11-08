import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Privacy } from './Privacy';
import { Copyright } from './Copyright';
import { Footer } from '../components/Footer';

const html = renderToString(<Privacy backLabel="模擬考列表" onBack={() => undefined} onCopyright={() => undefined} />);
const root = fileURLToPath(new URL('../../../', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(join(root, 'src')).filter((f) => /\.(ts|tsx|css|html)$/.test(f) && !/\.test\./.test(f) && !/Privacy\.tsx$/.test(f)); // 政策頁本身會寫出這些字眼

describe('隱私權頁', () => {
  it('有返回鈕、H1、更新日期、English 錨點與連結、mailto', () => {
    expect(html).toContain('← 回到 模擬考列表');
    expect(html).toContain('<h1 style="margin:0">隱私權政策</h1>');
    expect(html).toContain('隱私權政策｜模擬考小幫手');
    expect(html).toContain('最後更新日期：2026 年 11 月 8 日');
    expect(html).toContain('English version');
    expect(html).toContain('id="en"');
    expect(html).toContain('href="mailto:derliang@gmail.com"');
    expect(html).toContain('開發者沒有自己的伺服器或資料庫');
  });
  it('有一到八小節標題，順序正確，且不含老師隨手記專屬內容', () => {
    const titles = ['一、我們會存取哪些資料', '二、資料如何使用', '三、資料存放在哪裡', '四、是否分享給第三方', '五、你的權利', '六、學生資料', '七、政策更新', '八、聯絡方式'];
    let at = -1;
    for (const t of titles) {
      const i = html.indexOf(`<h2>${t}</h2>`);
      expect(i, t).toBeGreaterThan(at);
      at = i;
    }
    expect(html).not.toMatch(/drive\.file|Apps Script|Google 登入|有限使用/);
  });
  it('提醒勿把真實學生資料放進公開儲存庫', () => {
    expect(html).toContain('請勿把真實學生資料放進公開的儲存庫');
  });
  it('與版權頁、頁尾互連', () => {
    expect(html).toContain('使用授權');
    expect(renderToString(<Copyright onBack={() => undefined} onPrivacy={() => undefined} />)).toContain('隱私權政策');
    const foot = renderToString(<Footer version="1.0.0" buildDate="" onCopyright={() => undefined} onPrivacy={() => undefined} />);
    expect(foot).toContain('© 版權所有');
    expect(foot).toContain('>隱私權<');
  });
});

describe('隱私承諾與實際程式一致（對外聲明必須為真）', () => {
  it('原始碼與 index.html 沒有 Google Fonts、分析追蹤或其他外部資源', () => {
    const hits: string[] = [];
    for (const f of [...srcFiles, join(root, 'index.html')]) {
      const t = readFileSync(f, 'utf8');
      if (/googleapis|gstatic|google-analytics|googletagmanager|gtag\(|sendBeacon|XMLHttpRequest|new WebSocket|@import\s+url\(|<link[^>]+href="https?:|<script[^>]+src="https?:/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
  it('fetch 只出現在內嵌字型載入（同網站資源）', () => {
    const files = srcFiles.filter((f) => /\bfetch\(/.test(readFileSync(f, 'utf8')));
    expect(files.map((f) => f.replace(/\\/g, '/').split('/src/')[1])).toEqual(['export/fontLoader.ts']);
  });
  it('瀏覽器儲存只有 IndexedDB（資料夾控制代碼），沒有 Cookie／localStorage／sessionStorage／Service Worker', () => {
    const bad = srcFiles.filter((f) => /localStorage|sessionStorage|document\.cookie|serviceWorker/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
    const idb = srcFiles.filter((f) => /indexedDB/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\\/g, '/').split('/src/')[1]);
    expect(idb).toEqual(['data/fsRepository.ts']);
  });
  it('若已建置 dist，也沒有 Google Fonts／分析字樣', () => {
    const dist = join(root, 'dist');
    if (!existsSync(dist)) return;
    const hits = walk(dist).filter((f) => /\.(js|css|html)$/.test(f) && /googleapis|gstatic|google-analytics|googletagmanager/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
