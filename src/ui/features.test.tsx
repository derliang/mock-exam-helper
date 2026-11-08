import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { createMemoryFS } from '../data/dirfs';
import { loadDoc, saveDoc } from '../data/folder';
import { makeFixture } from '../export/fixtures';
import {
  allFeatures, BUILTIN_FEATURES, enabledExportItems, enabledNav, enabledStepPanels, FeatureContext,
  isEnabled, registerFeature, useIsEnabled, withFeature, type FeatureDef,
} from './features';
import { Step6 } from './pages/Step6';
import { Settings } from './pages/Settings';
import type { Doc } from './store';

const TEST_DEF: FeatureDef = { id: 'test-feature', name: '測試功能', desc: '只給測試', scope: 'all' };
const BCCT_DEF: FeatureDef = { id: 'test-bcct', name: '測試會考功能', desc: '只給測試', scope: 'bcct' };
const ui = {
  nav: { label: '測試導覽', route: { page: 'settings' as const } },
  exportItems: [{ key: 'test-x', title: '測試匯出項', sub: 'sub', run: async () => [] }],
  stepPanels: [{ step: 6 as const, render: () => <div>測試步驟面板</div> }],
};

function docOf(features?: Record<string, boolean>): Doc {
  const f = makeFixture();
  return {
    settings: { ...f.settings, ...(features ? { features } : {}) },
    rosters: { senior: f.students, junior: [] },
    exams: [f.exam],
    examFiles: { [f.exam.id]: { entries: f.entries, diffs: [], overrides: [] } },
  };
}

describe('選用功能：預設與判斷', () => {
  it('內建五項預設全關；會考專用只有快速模式', () => {
    const s = docOf().settings;
    for (const d of BUILTIN_FEATURES) {
      expect(isEnabled(d.id, { settings: s, examKind: 'bcct' })).toBe(false);
      expect(isEnabled(d.id, { settings: s, examKind: 'gsat' })).toBe(false);
    }
    expect(BUILTIN_FEATURES.filter((d) => d.scope === 'bcct').map((d) => d.id)).toEqual(['bcct-quick-mode']);
    expect(BUILTIN_FEATURES).toHaveLength(5);
  });

  it('舊存檔沒有 features 欄位，或只寫了部分功能：沒寫的視為關', () => {
    const old = { schoolName: '', headerText: '', defaultLabelPaper: 'B4' as const, classes: [], classrooms: [] };
    expect(isEnabled('pickup-list', { settings: old })).toBe(false);
    expect(isEnabled('pickup-list', { settings: { features: { 'student-lookup': true } } })).toBe(false);
    expect(isEnabled('student-lookup', { settings: { features: { 'student-lookup': true } } })).toBe(true);
  });

  it('未登記的功能一律關', () => {
    expect(isEnabled('no-such', { settings: { features: { 'no-such': true } } })).toBe(false);
  });

  it('會考專用：勾了也只在會考顯示，學測、分科與不在考試裡都不顯示', () => {
    const s = { features: { 'bcct-quick-mode': true } };
    expect(isEnabled('bcct-quick-mode', { settings: s, examKind: 'bcct' })).toBe(true);
    expect(isEnabled('bcct-quick-mode', { settings: s, examKind: 'gsat' })).toBe(false);
    expect(isEnabled('bcct-quick-mode', { settings: s, examKind: 'ast' })).toBe(false);
    expect(isEnabled('bcct-quick-mode', { settings: s })).toBe(false);
  });

  it('withFeature 只改一項，不動其他開關與設定', () => {
    const s0 = docOf({ 'student-lookup': true }).settings;
    const s1 = withFeature(s0, 'pickup-list', true);
    expect(s1.features).toEqual({ 'student-lookup': true, 'pickup-list': true });
    expect(s1.schoolName).toBe(s0.schoolName);
    expect(s0.features).toEqual({ 'student-lookup': true });
  });
});

describe('選用功能：註冊表接入（用假功能驗證）', () => {
  it('關閉時導覽、匯出項、步驟面板完全不出現；開啟才出現；取消註冊後消失', () => {
    const dispose = registerFeature(TEST_DEF.id, ui, TEST_DEF);
    try {
      const off = { settings: {} };
      expect(enabledNav(off)).toEqual([]);
      expect(enabledExportItems(off)).toEqual([]);
      expect(enabledStepPanels(off, 6)).toEqual([]);
      const on = { settings: { features: { [TEST_DEF.id]: true } } };
      expect(enabledNav(on).map((n) => n.label)).toEqual(['測試導覽']);
      expect(enabledExportItems(on).map((x) => x.key)).toEqual(['test-x']);
      expect(enabledStepPanels(on, 6)).toHaveLength(1);
      expect(enabledStepPanels(on, 5)).toHaveLength(0);
    } finally { dispose(); }
    expect(allFeatures().some((d) => d.id === TEST_DEF.id)).toBe(false);
    expect(enabledNav({ settings: { features: { [TEST_DEF.id]: true } } })).toEqual([]);
  });

  it('會考專用的假功能：在學測考試的匯出頁與導覽不出現', () => {
    const dispose = registerFeature(BCCT_DEF.id, ui, BCCT_DEF);
    try {
      const s = { features: { [BCCT_DEF.id]: true } };
      expect(enabledExportItems({ settings: s, examKind: 'gsat' })).toEqual([]);
      expect(enabledExportItems({ settings: s, examKind: 'bcct' })).toHaveLength(1);
      expect(enabledNav({ settings: s })).toEqual([]);
    } finally { dispose(); }
  });

  it('匯出頁：功能關閉時看不到「選用功能的輸出」與該項；開啟後才出現', () => {
    const dispose = registerFeature(TEST_DEF.id, ui, TEST_DEF);
    try {
      const off = renderToString(<Step6 doc={docOf()} exam={docOf().exams[0]!} onGoStep={() => {}} />);
      expect(off).not.toContain('選用功能的輸出');
      expect(off).not.toContain('測試匯出項');
      const d = docOf({ [TEST_DEF.id]: true });
      const on = renderToString(<Step6 doc={d} exam={d.exams[0]!} onGoStep={() => {}} />);
      expect(on).toContain('選用功能的輸出');
      expect(on).toContain('測試匯出項');
    } finally { dispose(); }
  });

  it('useIsEnabled：從設定讀出開關', () => {
    const Probe = () => <span>{useIsEnabled('student-lookup') ? '開' : '關'}</span>;
    expect(renderToString(<Probe />)).toContain('關');
    expect(renderToString(<FeatureContext.Provider value={{ features: { 'student-lookup': true } }}><Probe /></FeatureContext.Provider>)).toContain('開');
  });
});

describe('選用功能：設定頁與存檔', () => {
  it('設定頁「選用功能」列出全部功能與白話說明，預設都沒勾', () => {
    const html = renderToString(<Settings doc={docOf()} onChange={() => {}} tab="features" />);
    for (const d of BUILTIN_FEATURES) { expect(html).toContain(d.name); expect(html).toContain(d.desc); }
    expect(html).not.toContain('checked');
    expect(html).toContain('只用於會考');
  });

  it('存檔再讀回一致（含舊存檔缺欄位）', async () => {
    const fs = createMemoryFS();
    const d = docOf();
    await saveDoc(fs, d);
    const old = await loadDoc(fs);
    expect(old.data.settings.features).toBeUndefined();
    expect(isEnabled('pickup-list', { settings: old.data.settings })).toBe(false);
    const next: Doc = { ...d, settings: withFeature(withFeature(d.settings, 'pickup-list', true), 'student-lookup', false) };
    await saveDoc(fs, next);
    const back = await loadDoc(fs);
    expect(back.data.settings.features).toEqual({ 'pickup-list': true, 'student-lookup': false });
    expect(back.data.settings).toEqual(next.settings);
  });
});
