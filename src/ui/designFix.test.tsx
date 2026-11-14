/** 對稿修正包（1.7.1）：C-1 cmpseg、A-12 提示條圖示、A-4／A-5 步驟① 字 */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { Alert, Seg } from './components';

const noop = () => {};

describe('對稿修正', () => {
  it('C-1：Seg 可加 cmpseg 類別（375 寬直排），沒加維持原樣', () => {
    const o = [{ value: 'a', label: 'A' }];
    expect(renderToString(<Seg label="x" value="a" options={o} onChange={noop} className="cmpseg" />)).toContain('class="seg cmpseg"');
    expect(renderToString(<Seg label="x" value="a" options={o} onChange={noop} />)).toContain('class="seg"');
  });
  it('A-12：提示條用 .ico 圓章（data-i），不再用文字符號', () => {
    for (const [tone, i] of [['warn', '!'], ['danger', '!'], ['ok', '✓'], ['info', 'i']] as const) {
      const html = renderToString(<Alert tone={tone}>內容</Alert>);
      expect(html).toContain('class="ico"');
      expect(html).toContain(`data-i="${i}"`);
      expect(html).not.toMatch(/[⚠⛔ℹ]/u);
    }
  });
});
