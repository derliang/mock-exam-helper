/** I-2a：全站品牌列、標示簡稱（H-3）、預備教室需要／已列入（H-4）、↩ 回到 ○ 步（wsRet）。全部假資料 */
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { subjectShort } from '../core/subjectShort';
import { AppBar, nextTheme } from './components/AppBar';
import { App } from './App';

const noop = () => {};
describe('全站品牌列（稿 v2.31）', () => {
  const items = [
    { id: 'a', label: '資料夾設定', onClick: noop },
    { id: 'b', label: '模擬考列表', current: true, onClick: noop },
    { id: 'c', label: '選用功能', onClick: noop },
    { id: 'd', label: '共用設定', onClick: noop },
  ];
  const html = renderToString(<AppBar version="v1.4.0" items={items} theme="system" onTheme={noop} onHome={noop} />);
  it('標誌＋名稱＋版本、主導覽、外觀切換、手機用的「選單」鈕', () => {
    for (const t of ['模擬考小幫手', 'v1.4.0', '資料夾設定', '模擬考列表', '選用功能', '共用設定', '跟隨系統', '選單']) expect(html).toContain(t);
  });
  it('目前所在頁用 aria-current，不黏頂（class 不是 pbar）', () => {
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('class="appbar"');
    expect(html).not.toContain('class="pbar"');
  });
  it('外觀依序：跟隨系統 → 淺色 → 深色 → 跟隨系統', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
  it('App 一開始（資料夾設定頁）就有品牌列', () => {
    const h = renderToString(<App />);
    expect(h).toContain('id="appbar"');
  });
});

describe('標示簡稱（H-3）', () => {
  it('數學A／B 簡稱「數A／數B」，其他科目不變', () => {
    expect(subjectShort('數學B')).toBe('數B');
    expect(subjectShort('數學A')).toBe('數A');
    expect(subjectShort('社會')).toBe('社會');
    expect(subjectShort('數學')).toBe('數學');
  });
});

describe('預備教室需要／已列入（H-4）', () => {
  it('沒有抽離時需要 0，已列入間數與座位合計對得上', async () => {
    const { demoDoc } = await import('./repository');
    const { newExam } = await import('./store');
    const { reserveNeed } = await import('./capacity');
    const r = newExam(demoDoc(), 'gsat', '學測第三次', new Date('2026-09-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    const exam = r.doc.exams[r.doc.exams.length - 1]!;
    const n = reserveNeed(r.doc, exam);
    expect(n.need).toBe(0);
    expect(n.on).toBeLessThanOrEqual(n.total);
    expect(n.avail).toBeGreaterThanOrEqual(0);
  });
});
