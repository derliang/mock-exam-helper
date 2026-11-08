import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { makeFixture } from '../export/fixtures';
import { renderPrintHtml } from '../export/htmlRender';
import { buildPickupPages } from '../export/pickup';
import { enabledExportItems, enabledNav, isEnabled } from './features';
import { Step6 } from './pages/Step6';
import type { Doc } from './store';
import './featureRegister/pickup';

function docOf(on: boolean): Doc {
  const f = makeFixture();
  return {
    settings: { ...f.settings, ...(on ? { features: { 'pickup-list': true } } : {}) },
    rosters: { senior: f.students, junior: [] },
    exams: [f.exam],
    examFiles: { [f.exam.id]: { entries: f.entries, diffs: [], overrides: [] } },
  };
}

describe('領卷清單：選用功能開關（H3）', () => {
  it('預設關：導覽與匯出頁都不出現', () => {
    const d = docOf(false);
    expect(isEnabled('pickup-list', { settings: d.settings })).toBe(false);
    expect(enabledNav({ settings: d.settings })).toEqual([]);
    expect(enabledExportItems({ settings: d.settings, examKind: 'gsat' }).filter((x) => x.featureId === 'pickup-list')).toEqual([]);
    const html = renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />);
    expect(html).not.toContain('領卷清單');
  });
  it('開啟後匯出頁多出一項；學測與會考都適用', () => {
    const d = docOf(true);
    expect(enabledExportItems({ settings: d.settings, examKind: 'gsat' }).map((x) => x.key)).toContain('pickup');
    expect(enabledExportItems({ settings: d.settings, examKind: 'bcct' }).map((x) => x.key)).toContain('pickup');
    const html = renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />);
    expect(html).toContain('領卷清單（A4）');
  });
});

describe('領卷清單：版面內容', () => {
  const input = makeFixture();
  const pages = buildPickupPages(input);
  it('每間教室一頁（含預備教室），標題用考試名稱，每科一列加合計列', () => {
    expect(pages).toHaveLength(3);
    expect(pages[0]?.title).toBe('測試模擬考　領卷清單');
    expect(pages[0]?.subtitle).toContain('甲教室');
    expect(pages[0]?.rows.map((r) => r[0])).toEqual(['國文', '英文', '數學']);
    expect(pages[0]?.heads).toContain('核對（點數後打勾）');
    expect(pages[0]?.rows.every((r) => r[3] === '')).toBe(true); // 核對欄留白供手寫
  });
  it('試卷份數與答案卡份數相同，合計正確；抽離的英文在備註說明，預備教室領到抽離者', () => {
    const a = pages[0]!;
    expect(a.rows.every((r) => r[1] === r[2])).toBe(true);
    expect(Number(a.totalRow?.[1])).toBe(a.rows.reduce((n, r) => n + Number(r[1]), 0));
    expect(a.rows[1]?.[4]).toContain('抽離');
    expect(pages[2]?.rows.find((r) => r[0] === '英文')?.[1]).toBe('2');
  });
  it('Word：產生 docx，每間教室一個分節，用到的字都在內嵌字型字集內', async () => {
    const { readFileSync } = await import('node:fs');
    const { default: JSZip } = await import('jszip');
    const { renderDocx } = await import('../export/docxRender');
    const dir = new URL('../export/fonts/', import.meta.url);
    const fonts = { regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', dir))), bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', dir))) };
    const charset = new Set(readFileSync(new URL('NotoSansTC-Regular-big5.chars.txt', dir), 'utf8'));
    const buf = await renderDocx({ table: pages }, { fonts, generatedAt: input.result.generatedAt, dataVersion: input.result.dataVersion });
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    expect(xml.match(/<w:sectPr/g)).toHaveLength(3);
    expect(xml).toContain('領卷清單');
    const text = pages.flatMap((p) => [p.title, p.subtitle ?? '', ...p.heads, ...p.rows.flat(), ...(p.totalRow ?? [])]).join('');
    expect([...text].filter((ch) => /[一-鿿]/.test(ch) && !charset.has(ch))).toEqual([]);
  });
  it('列印頁含標題與核對欄', () => {
    const html = renderPrintHtml({ table: pages }, { generatedAt: input.result.generatedAt, dataVersion: input.result.dataVersion });
    expect(html).toContain('測試模擬考　領卷清單');
    expect(html).toContain('核對（點數後打勾）');
    expect(html.match(/<section class="sheet a4"/g)).toHaveLength(3);
  });
});
