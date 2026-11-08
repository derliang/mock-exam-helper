import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Copyright } from './Copyright';
import { Footer } from '../components/Footer';

describe('版權頁（框架）', () => {
  it('有返回按鈕、程式名稱、© 2026 模擬考小幫手，授權與字型正文是「待確認」佔位', () => {
    const html = renderToString(<Copyright backLabel="模擬考列表" onBack={() => undefined} />);
    expect(html).toContain('← 回到 模擬考列表');
    expect(html).toContain('© 2026 模擬考小幫手');
    expect(html).toContain('data-pending="license"');
    expect(html).toContain('data-pending="font-ofl"');
    expect(html.match(/待確認/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('頁尾的「© 版權所有」是按鈕，點了進版權頁', () => {
    expect(renderToString(<Footer version="1.0.0" buildDate="" onCopyright={() => undefined} />)).toContain('pf-link');
  });
});
