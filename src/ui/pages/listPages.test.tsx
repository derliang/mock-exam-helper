import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { demoDoc } from '../repository';
import { newExam } from '../store';
import { Exams } from './Exams';
import { NewExam } from './NewExam';

const noop = () => undefined;
function docWith(): ReturnType<typeof demoDoc> {
  let d = demoDoc();
  for (const [k, n] of [['gsat', '學測第一次'], ['bcct', '會考第一次']] as const) {
    const r = newExam(d, k, n, new Date(`2026-1${k === 'gsat' ? 0 : 1}-01T02:00:00Z`));
    if (!r.ok) throw new Error(r.error);
    d = r.doc;
  }
  return d;
}

describe('模擬考列表頁', () => {
  it('頁首：h1、資料夾 chip、更換資料夾、設定、新增；每列有六格進度、步數、最後修改；有圖例', () => {
    const html = renderToString(<Exams doc={docWith()} folder="範例資料夾" onOpen={noop} onNew={noop} onSettings={noop} onChangeFolder={noop} />);
    expect(html).toContain('<h1>模擬考</h1>');
    expect(html).toContain('範例資料夾');
    for (const t of ['更換資料夾', '設定', '新增模擬考', '最後修改', '步完成', '進度條圖例']) expect(html).toContain(t);
    expect(html).toContain('高中部・學測');
    expect(html).toContain('國中部・會考');
    expect(html).toMatch(/115 學年・高三・(\d+ 人|尚未匯入名單)/);
    expect((html.match(/class="dots"/g) ?? []).length).toBe(2);
    // 新到舊：會考（11 月）在學測（10 月）前面
    expect(html.indexOf('會考第一次')).toBeLessThan(html.indexOf('學測第一次'));
  });
  it('空狀態文案與原型一致', () => {
    const html = renderToString(<Exams doc={demoDoc()} onOpen={noop} onNew={noop} onSettings={noop} onChangeFolder={noop} />);
    expect(html).toContain('還沒有模擬考');
    expect(html).toContain('按「新增模擬考」開始。');
  });
});

describe('新增模擬考整頁', () => {
  const html = renderToString(<NewExam doc={demoDoc()} onCancel={noop} onCreate={noop} now={() => new Date(2026, 10, 8)} />);
  it('三段式：選類型、基本資料、預設設定', () => {
    for (const t of ['1　選類型', '2　基本資料', '3　預設設定', '建立並開始', '返回路徑']) expect(html).toContain(t);
  });
  it('三張類型卡，分科可選、學測已選', () => {
    expect((html.match(/class="tcard"/g) ?? []).length).toBe(3);
    expect(html).not.toContain('尚未開放');
    expect(html).toContain('已選');
  });
  it('名稱預設帶建議名稱、學期下拉、唯讀對象、學年提示', () => {
    expect(html).toContain('value="學測第一次"');
    expect(html).toContain('termcards');
    expect(html).toContain('上學期');
    expect(html).toContain('高三');
    expect(html).toContain('115 學年');
    expect(html).toContain('還沒有同類型的模擬考');
  });
  it('有同類型舊考試時顯示會帶入哪一次的設定', () => {
    const html2 = renderToString(<NewExam doc={docWith()} onCancel={noop} onCreate={noop} />);
    expect(html2).toContain('會帶入「學測第一次」的設定');
    expect(html2).toContain('value="學測第二次"');
  });
});

describe('設定頁部別預設（項目 8）', () => {
  it('從國中部考試進來預設國中部，沒指定仍是高中部', async () => {
    const { Settings } = await import('./Settings');
    const pressed = (html: string, label: string) => new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html);
    const j = renderToString(<Settings doc={demoDoc()} onChange={noop} tab="roster" division="junior" />);
    expect(pressed(j, '國中部')).toBe(true);
    const s = renderToString(<Settings doc={demoDoc()} onChange={noop} tab="roster" />);
    expect(pressed(s, '高中部')).toBe(true);
  });
});
