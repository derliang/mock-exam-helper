import { readFileSync, readdirSync } from 'node:fs';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Copyright, EMBEDDED_FONTS, LICENSE_COPYRIGHT_LINE, RUNTIME_PACKAGES } from './Copyright';
import { Footer } from '../components/Footer';

const html = renderToString(<Copyright backLabel="模擬考列表" onBack={() => undefined} />);
const root = new URL('../../../', import.meta.url);

describe('版權頁', () => {
  it('有返回按鈕、H1、版權行、頁頂名稱與頁尾版權行', () => {
    expect(html).toContain('← 回到 模擬考列表');
    expect(html).toContain('使用授權與著作權聲明');
    expect(html).toContain('使用授權｜模擬考小幫手');
    expect(html).toContain(LICENSE_COPYRIGHT_LINE.replace('©', '©'));
    expect(html).toContain('Copyright © 2026 黃德亮（公開作者識別：derliang）｜保留所有權利（All Rights Reserved）｜聲明日期：2026-11-08');
    expect(html).toContain('© 2026 derliang｜保留所有權利｜限非營利使用');
    expect(html).toContain('<b>所有使用者都限非營利使用</b>');
    expect(html).not.toContain('待確認');
  });
  it('有一到十一小節標題，順序正確', () => {
    const titles = ['一、授權範圍', '二、聖功女中師生使用', '三、其他學校、機構或個人', '四、所有使用者均須遵守非營利限制', '五、保留權利', '六、公開網頁與原始碼之說明', '七、第三方素材與既有授權', '八、不附保證', '九、學生與教師資料', '十、聯絡', '十一、生效與版本'];
    expect(html.match(/<h2>/g)?.length).toBe(11);
    let at = -1;
    for (const t of titles) {
      const i = html.indexOf(`<h2>${t}</h2>`);
      expect(i, t).toBeGreaterThan(at);
      at = i;
    }
  });
  it('有 mailto 連結', () => {
    expect(html).toContain('href="mailto:derliang@gmail.com"');
  });
  it('第七節字型與套件名稱和實際一致，並含 OFL 全文', () => {
    const files = readdirSync(new URL('src/export/fonts/', root)).filter((f) => f.endsWith('.ttf'));
    expect(files.sort()).toEqual(['NotoSansTC-Bold-core.ttf', 'NotoSansTC-Regular-big5.ttf']);
    expect(EMBEDDED_FONTS.length).toBe(files.length);
    for (const f of EMBEDDED_FONTS) expect(html).toContain(f);
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).map((n) => n.toLowerCase()).sort()).toEqual([...RUNTIME_PACKAGES].map((n) => n.toLowerCase()).sort());
    for (const n of RUNTIME_PACKAGES) expect(html).toContain(n);
    expect(html).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });
  it('第九節是資料說明', () => {
    expect(html).toContain('本網站不會上傳');
  });
  it('頁面條文與 LICENSE.md 一致：同樣十一個小節標題', () => {
    const md = readFileSync(new URL('LICENSE.md', root), 'utf8');
    const mdTitles = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(mdTitles.length).toBe(11);
    for (const t of mdTitles) expect(html).toContain(`<h2>${t}</h2>`);
    expect(md).toContain('聲明日期：2026-11-08');
  });
});

describe('頁尾', () => {
  it('「© 版權所有」是按鈕，點了進版權頁', () => {
    expect(renderToString(<Footer version="1.0.0" buildDate="" onCopyright={() => undefined} />)).toContain('pf-link');
  });
});
