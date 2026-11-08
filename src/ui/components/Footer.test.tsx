import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('頁尾元件', () => {
  it('顯示程式名稱、版本、預發布標示與版權', () => {
    const html = renderToString(<Footer version="0.1.0-beta.1" buildDate="2026-11-08" />);
    expect(html).toContain('<footer');
    expect(html).toContain('模擬考小幫手');
    expect(html).toContain('v0.1.0-beta.1');
    expect(html).toContain('pf-pre');
    expect(html).toContain('© 版權所有');
  });
  it('正式版沒有預發布標籤', () => {
    expect(renderToString(<Footer version="1.0.0" buildDate="" />)).not.toContain('pf-pre');
  });
  it('「關於」預設不展開', () => {
    expect(renderToString(<Footer version="1.0.0" buildDate="" />)).not.toContain('role="dialog"');
  });
});
