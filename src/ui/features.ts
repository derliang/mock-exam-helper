/**
 * 選用功能註冊表（D75、D77、D78）。
 * 核心（排座、標籤、座位表、抽離、下載、防呆、常駐摘要列）永遠開啟，不在這裡。
 * 選用功能預設全「關」，使用者在設定頁「選用功能」逐項勾選；關掉的功能從導覽、下載頁與步驟中
 * 完全消失（不留灰色入口）。新增選用功能的接入方式見 docs/dispatch/H包接入指南.md。
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ComponentChild } from 'preact';
import type { ExamConfig, ExamKind, Settings } from '../data';
import type { OutputFile } from '../export/plan';
import type { Route } from './nav';
import type { Doc } from './store';

/** all＝所有考試；bcct＝只對會考（科目固定七科、無選考）提供，學測／分科不顯示（D77⑤） */
export type FeatureScope = 'all' | 'bcct';

export interface FeatureDef {
  id: string;
  /** 設定頁顯示的中文名 */
  name: string;
  /** 白話簡短說明 */
  desc: string;
  scope: FeatureScope;
}

/** 下載頁多出的一項（勾選後與核心項目一起下載） */
export interface ExportExtra {
  key: string;
  title: string;
  sub: string;
  /** 產生檔案；回傳 text/html 的走列印頁，其餘當檔案下載 */
  run: (c: { doc: Doc; exam: ExamConfig; format: 'word' | 'pdf' }) => Promise<OutputFile[]>;
}

export interface StepPanel {
  /** 出現在哪一步（1～6）的最下方 */
  step: 1 | 2 | 3 | 4 | 5 | 6;
  render: (p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; /** 跳到某一步（面板需要引導時用） */ onStep?: (n: 1 | 2 | 3 | 4 | 5 | 6) => void }) => ComponentChild;
}

/** 一個功能接入畫面的所有位置；每個欄位都可省略 */
export interface FeatureUi {
  /** 頂端導覽多一個按鈕（導向 route）；route 的頁面元件由該功能自己在 App 的路由表登記 */
  nav?: { label: string; route: Route };
  exportItems?: ExportExtra[];
  stepPanels?: StepPanel[];
}

/** 本次已規劃的選用功能（D77），預設全關 */
export const BUILTIN_FEATURES: FeatureDef[] = [
  { id: 'pickup-list', name: '領卷清單（含對卷）', desc: '每間教室、每科要領幾份試卷與答案卡，領卷時照表點數核對。', scope: 'all' },
  { id: 'student-lookup', name: '考生查詢', desc: '輸入考生編號、座號、學號或姓名，查他每一科在哪間教室、哪個座位。', scope: 'all' },
  { id: 'attendance-sheet', name: '出缺席記錄表', desc: '每間教室一頁，照座位順序列出考生，留打勾欄，考試當天點名用。', scope: 'all' },
  { id: 'print-alignment', name: '列印對位測試頁', desc: '正式列印前先印測試頁（A4、B4、A3 各一頁），確認 100% 縮放與邊界沒有被印表機裁掉。', scope: 'all' },
  { id: 'bcct-quick-mode', name: '會考快速模式', desc: '沿用上次會考的設定；貼上新名單、四項檢查都過時會自動排座，看過檢核後再下載。只用於會考。', scope: 'bcct' },
];

const defs: FeatureDef[] = [...BUILTIN_FEATURES];
const uis = new Map<string, FeatureUi>();

/** 註冊一個功能的畫面接入點；id 必須是目錄中已有的功能（內建，或同時傳入 def 新增） */
export function registerFeature(id: string, ui: FeatureUi, def?: FeatureDef): () => void {
  if (def && !defs.some((d) => d.id === def.id)) defs.push(def);
  if (!defs.some((d) => d.id === id)) throw new Error(`未登記的功能：${id}`);
  uis.set(id, ui);
  return () => { uis.delete(id); if (def) { const i = defs.findIndex((d) => d.id === def.id); if (i >= 0) defs.splice(i, 1); } };
}

export const allFeatures = (): readonly FeatureDef[] => defs;
export const featureOf = (id: string): FeatureDef | undefined => defs.find((d) => d.id === id);

export interface FeatureCtx {
  settings: Partial<Settings>;
  /** 目前所在考試的類型；不在考試裡（如設定頁、列表）為 undefined */
  examKind?: ExamKind;
}

/**
 * 這個功能現在要不要出現。
 * 未登記→關；設定沒寫（舊存檔）→預設關；會考專用且目前不是會考（含不在考試裡）→關。
 */
export function isEnabled(id: string, ctx: FeatureCtx): boolean {
  const d = featureOf(id);
  if (!d) return false;
  if (d.scope === 'bcct' && ctx.examKind !== 'bcct') return false;
  return ctx.settings.features?.[id] === true;
}

const enabledIds = (ctx: FeatureCtx): string[] => defs.filter((d) => isEnabled(d.id, ctx)).map((d) => d.id);

export function enabledNav(ctx: FeatureCtx): { id: string; label: string; route: Route }[] {
  return enabledIds(ctx).flatMap((id) => { const n = uis.get(id)?.nav; return n ? [{ id, ...n }] : []; });
}

export function enabledExportItems(ctx: FeatureCtx): (ExportExtra & { featureId: string })[] {
  return enabledIds(ctx).flatMap((id) => (uis.get(id)?.exportItems ?? []).map((x) => ({ ...x, featureId: id })));
}

export function enabledStepPanels(ctx: FeatureCtx, step: number): (StepPanel & { featureId: string })[] {
  return enabledIds(ctx).flatMap((id) => (uis.get(id)?.stepPanels ?? []).filter((s) => s.step === step).map((s) => ({ ...s, featureId: id })));
}

/** 回傳新設定：只改這一項開關，其他不動 */
export function withFeature(settings: Settings, id: string, on: boolean): Settings {
  return { ...settings, features: { ...settings.features, [id]: on } };
}

/** 讓元件讀到目前的設定；App 在最外層提供 */
export const FeatureContext = createContext<Partial<Settings>>({});

/** Preact hook：這個功能現在要不要出現（元件內用） */
export function useIsEnabled(id: string, examKind?: ExamKind): boolean {
  const settings = useContext(FeatureContext);
  return isEnabled(id, { settings, examKind });
}
