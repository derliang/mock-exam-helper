/** 稿 v2.29 各頁共用單一頁首、校-08 步驟條文字（全部假資料） */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { PageHead, StepNav } from './components';

const noop = () => {};
describe('共用頁首', () => {
  it('有路徑：路徑列最後一個是目前頁；標題卡右側「已儲存／復原／共用設定」成組', () => {
    const html = renderToString(<PageHead crumbs={[{ label: '模擬考列表', onClick: noop }]} title="甲考試" badge="學測第一次" status="已儲存到資料夾"><button>共用設定</button></PageHead>);
    expect(html).toContain('class="crumbs"');
    expect(html).toContain('>模擬考列表</button>');
    expect(html).toContain('aria-current="page">甲考試');
    expect(html).toContain('ph-cap');
    expect(html).toContain('已儲存到資料夾');
    expect(html).toContain('共用設定');
  });
  it('根頁沒有路徑列；沒有的項目整段拿掉', () => {
    const html = renderToString(<PageHead title="模擬考" />);
    expect(html).not.toContain('crumbs');
    expect(html).not.toContain('ph-tools');
    expect(html).toContain('pghd noc');
  });
});

describe('步驟條文字（校-08）', () => {
  it('第 N／6 步　已完成 K 步', () => {
    const steps = [1, 2, 3, 4, 5, 6].map((no) => ({ no, name: `s${no}`, state: (no === 1 ? 'done' : no === 2 ? 'cur' : 'todo') as 'done' | 'cur' | 'todo' }));
    const html = renderToString(<StepNav steps={steps} onGo={noop} />);
    expect(html).toContain('第 2／6 步');
    expect(html).toContain('已完成 1 步');
  });
});
