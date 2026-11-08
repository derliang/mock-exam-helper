import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { ALIGN_PAPERS, alignmentSpec, renderAlignmentHtml } from '../export/alignment';
import { makeFixture } from '../export/fixtures';
import { enabledExportItems, enabledNav } from './features';
import { Step6 } from './pages/Step6';
import type { Doc } from './store';
import './featureRegister/alignment';

function docOf(on: boolean): Doc {
  const f = makeFixture();
  return {
    settings: { ...f.settings, ...(on ? { features: { 'print-alignment': true } } : {}) },
    rosters: { senior: f.students, junior: [] },
    exams: [f.exam],
    examFiles: { [f.exam.id]: { entries: f.entries, diffs: [], overrides: [] } },
  };
}

describe('列印對位測試頁：選用功能開關（H6）', () => {
  it('預設關：導覽與匯出頁都不出現', () => {
    const d = docOf(false);
    expect(enabledNav({ settings: d.settings })).toEqual([]);
    expect(enabledExportItems({ settings: d.settings, examKind: 'gsat' }).filter((x) => x.featureId === 'print-alignment')).toEqual([]);
    const html = renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />);
    expect(html).not.toContain('列印對位測試頁');
  });
  it('開啟後匯出頁多出一項；學測與會考都適用', () => {
    const d = docOf(true);
    expect(enabledExportItems({ settings: d.settings, examKind: 'gsat' }).map((x) => x.key)).toContain('print-alignment');
    expect(enabledExportItems({ settings: d.settings, examKind: 'bcct' }).map((x) => x.key)).toContain('print-alignment');
    const html = renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />);
    expect(html).toContain('列印對位測試頁（A4、B4、A3）');
  });
});

describe('列印對位測試頁：尺寸與邊距數值', () => {
  it('三種紙的尺寸、10mm 邊框、100mm 尺規', () => {
    expect(alignmentSpec('A4')).toMatchObject({ widthMm: 210, heightMm: 297, marginMm: 10, scaleBarMm: 100 });
    expect(alignmentSpec('B4')).toMatchObject({ widthMm: 250, heightMm: 353, marginMm: 10 });
    expect(alignmentSpec('A3')).toMatchObject({ widthMm: 297, heightMm: 420, marginMm: 10 });
  });
  it('標籤格線：A3 7×7 每格 35mm 正方、B4 6×8、A4 沒有', () => {
    expect(alignmentSpec('A3').labels).toEqual({ cols: 7, rows: 7, cellW: 35, cellH: 35 });
    const b4 = alignmentSpec('B4').labels!;
    expect([b4.cols, b4.rows]).toEqual([6, 8]);
    expect(b4.cellW).toBeCloseTo((250 - 20) / 6, 5);
    expect(alignmentSpec('A4').labels).toBeUndefined();
  });
  it('列印頁：三頁各一，具名 @page 紙張尺寸與零邊界，SVG 以 mm 為單位', () => {
    const html = renderAlignmentHtml({ generatedAt: '2026-11-08T00:00:00Z', dataVersion: 'T1' });
    expect(html.match(/<section class="sheet"/g)).toHaveLength(ALIGN_PAPERS.length);
    expect(html).toContain('@page a4 { size: 210mm 297mm; margin: 0 }');
    expect(html).toContain('@page b4 { size: 250mm 353mm; margin: 0 }');
    expect(html).toContain('@page a3 { size: 297mm 420mm; margin: 0 }');
    expect(html).toContain('width="297mm" height="420mm"');
    expect(html).toContain('viewBox="0 0 210 297"');
    expect(html).toContain('請以 100% 列印，量到 100 mm 才正確');
    expect(html).toContain('資料版本碼：T1');
  });
  it('尺規長度＝100：起訖端點相差 100 單位（1 單位＝1mm）', () => {
    const html = renderAlignmentHtml({ generatedAt: '2026-11-08T00:00:00Z', dataVersion: 'T1' }, ['A4']);
    expect(html).toContain('<line x1="55" y1="'); // (210-100)/2
    expect(html).toContain('x2="155"'); // 55+100
  });
  it('標籤格線只出現在 B4、A3（A4 單頁不含虛線格）', () => {
    const only = (p: 'A4' | 'B4') => renderAlignmentHtml({ generatedAt: '2026-11-08T00:00:00Z', dataVersion: 'T1' }, [p]);
    expect(only('A4')).not.toContain('標籤格');
    expect(only('B4')).toContain('標籤格 6×8');
  });
});
