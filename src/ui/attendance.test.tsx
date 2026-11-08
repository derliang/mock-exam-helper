import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { makeFixture } from '../export/fixtures';
import { enabledExportItems, enabledNav, isEnabled } from './features';
import { Step6 } from './pages/Step6';
import type { Doc } from './store';
import './featureRegister/attendance';

function docOf(on: boolean): Doc {
  const f = makeFixture();
  return {
    settings: { ...f.settings, ...(on ? { features: { 'attendance-sheet': true } } : {}) },
    rosters: { senior: f.students, junior: [] },
    exams: [f.exam],
    examFiles: { [f.exam.id]: { entries: f.entries, diffs: [], overrides: [] } },
  };
}

describe('出缺席記錄表：選用功能開關（H5）', () => {
  it('預設關：導覽與匯出頁都不出現', () => {
    const d = docOf(false);
    expect(isEnabled('attendance-sheet', { settings: d.settings })).toBe(false);
    expect(enabledNav({ settings: d.settings })).toEqual([]);
    expect(enabledExportItems({ settings: d.settings, examKind: 'gsat' }).filter((x) => x.featureId === 'attendance-sheet')).toEqual([]);
    expect(renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />)).not.toContain('出缺席記錄表');
  });
  it('開啟後匯出頁多出一項；學測與會考都適用', () => {
    const d = docOf(true);
    for (const k of ['gsat', 'bcct'] as const) expect(enabledExportItems({ settings: d.settings, examKind: k }).map((x) => x.key)).toContain('attendance');
    expect(renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />)).toContain('出缺席記錄表（A4）');
  });
});
