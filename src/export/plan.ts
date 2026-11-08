/**
 * 匯出規劃（純函式）：依使用者勾選決定產生哪些檔案、各幾頁，匯出前檢查，並實際產生內容。
 * 畫面層（Step6）只呼叫這裡；檔案下載與開新視窗由畫面層做。
 */
import type { LabelPaper } from '../data';
import {
  buildLabelPages,
  buildSeatPages,
  buildStudyLists,
  defaultLabelLayout,
  findMissingChars,
  type ExportInput,
  type LabelPageModel,
  type ListPageModel,
  type SeatPageModel,
} from './model';
import type { FontData } from './docxRender';
import { renderPrintHtml } from './htmlRender';

export type ExportFormat = 'word' | 'pdf';
export interface ExportOptions {
  format: ExportFormat;
  /** 座位表（每間班級教室一頁，A4） */
  seat: boolean;
  /** 標籤（每間教室一張紙） */
  label: boolean;
  paper: LabelPaper;
  /** 抽離自習名單（每科一頁，A4）；國中部沒有 */
  study: boolean;
  /** 預備教室座位表（A4）；勾標籤時一併產生預備教室標籤 */
  reserve: boolean;
}

export const defaultOptions = (paper: LabelPaper = 'B4'): ExportOptions => ({
  format: 'word',
  seat: true,
  label: true,
  paper,
  study: true,
  reserve: true,
});

export interface PlannedFile {
  key: 'seat' | 'label' | 'study' | 'reserveSeat' | 'reserveLabel';
  name: string;
  desc: string;
  pages: number;
}

interface Parts {
  seat?: SeatPageModel[];
  label?: LabelPageModel[];
  study?: ListPageModel[];
  reserveSeat?: SeatPageModel[];
  reserveLabel?: LabelPageModel[];
}

/** 檔名不能含的字元換成底線 */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|]/g, '_').trim() || '模擬考';

/** 把勾選轉成版面模型；標籤紙張依選項覆蓋考試設定的格數（D74） */
export function buildParts(input: ExportInput, o: ExportOptions): Parts {
  const withPaper: ExportInput = { ...input, exam: { ...input.exam, labelLayout: defaultLabelLayout(o.paper) } };
  const parts: Parts = {};
  if (o.seat) parts.seat = buildSeatPages(withPaper, 'class');
  if (o.label) parts.label = buildLabelPages(withPaper, 'class');
  if (o.study) {
    const l = buildStudyLists(withPaper);
    if (l.length) parts.study = l;
  }
  if (o.reserve) {
    const rs = buildSeatPages(withPaper, 'reserve');
    if (rs.length) parts.reserveSeat = rs;
    if (o.label) {
      const rl = buildLabelPages(withPaper, 'reserve');
      if (rl.length) parts.reserveLabel = rl;
    }
  }
  return parts;
}

export function planFiles(input: ExportInput, o: ExportOptions): PlannedFile[] {
  const parts = buildParts(input, o);
  const ext = o.format === 'word' ? 'docx' : 'pdf';
  const base = safeName(input.exam.name);
  const out: PlannedFile[] = [];
  if (parts.seat) out.push({ key: 'seat', name: `${base}-座位表.${ext}`, desc: `${parts.seat.length} 頁（每間班級教室一頁，A4）`, pages: parts.seat.length });
  if (parts.label) out.push({ key: 'label', name: `${base}-標籤（${o.paper}）.${ext}`, desc: `${parts.label.length} 張紙（每間班級教室一張，${o.paper}）`, pages: parts.label.length });
  if (parts.study) out.push({ key: 'study', name: `${base}-抽離自習名單.${ext}`, desc: `${parts.study.length} 頁（每科一頁，A4）`, pages: parts.study.length });
  if (parts.reserveSeat) out.push({ key: 'reserveSeat', name: `${base}-預備教室座位表.${ext}`, desc: `${parts.reserveSeat.length} 頁（每科每間預備教室一頁，A4）`, pages: parts.reserveSeat.length });
  if (parts.reserveLabel) out.push({ key: 'reserveLabel', name: `${base}-預備教室標籤（${o.paper}）.${ext}`, desc: `${parts.reserveLabel.length} 張紙（${o.paper}）`, pages: parts.reserveLabel.length });
  return out;
}

export type IssueLevel = 'block' | 'warn';
export interface Issue {
  level: IssueLevel;
  text: string;
}
export interface PreflightState {
  /** 排座結果過期（名單或設定改了，D22） */
  stale?: boolean;
  /** 考試名單與學生名單尚未處理的差異數（D42） */
  unresolvedDiffs?: number;
}

/**
 * 匯出前檢查：擋下的（block）不能匯出；警告（warn）可匯出但要讓使用者知道。
 * hasChar：字型字集檢查（D44）；回報只含班級＋座號＋字元，不含姓名。
 */
export function preflight(input: ExportInput, o: ExportOptions, st: PreflightState, hasChar: (ch: string) => boolean): Issue[] {
  const issues: Issue[] = [];
  if (st.stale) issues.push({ level: 'block', text: '排座結果過期：名單或設定在排座之後改過，表上的座位可能已經不對。請回 ⑤ 重新排座，再回來匯出。' });
  if ((st.unresolvedDiffs ?? 0) > 0) issues.push({ level: 'block', text: `② 還有 ${st.unresolvedDiffs} 筆考試名單與學生名單的差異沒處理（例如新增、缺少或資料不同的考生）。請回 ② 逐筆選擇處理方式，處理完再匯出。` });
  if (!o.seat && !o.label && !o.study && !o.reserve) issues.push({ level: 'block', text: '還沒勾選要匯出的內容：請在下方至少勾選座位表、標籤、抽離自習名單或預備教室其中一項。' });
  try {
    buildParts(input, o);
  } catch (e) {
    issues.push({ level: 'block', text: e instanceof Error ? e.message : String(e) });
  }
  if (o.format === 'word') {
    const miss = findMissingChars(input, hasChar);
    if (miss.length) {
      const shown = miss.slice(0, 8).map((m) => `${String(m.classNo).padStart(2, '0')}${String(m.seatNo).padStart(2, '0')} 的「${m.ch}」`).join('、');
      issues.push({
        level: 'warn',
        text: `${miss.length} 個罕用字不在內嵌字型內（${shown}${miss.length > 8 ? '…' : ''}）。仍可匯出，但 Word 會改用該電腦的字型顯示這些字；匯出後請開檔確認，必要時手動改字型。`,
      });
    }
  }
  return issues;
}

export interface OutputFile {
  name: string;
  mime: string;
  /** Word 為位元組；PDF（列印用 HTML）為字串 */
  data: Uint8Array | string;
  desc: string;
  pages: number;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * 產生檔案。Word：每類一個 .docx（D69）。PDF：瀏覽器列印成 PDF（D29），
 * 所有勾選內容合併成一個「列印用頁面」，各頁紙張大小由 @page 決定，開啟後選「另存為 PDF」。
 */
export async function runExport(
  input: ExportInput,
  o: ExportOptions,
  env: { fonts: FontData; boldMode?: 'separate-family' | 'embed-bold' },
): Promise<OutputFile[]> {
  const parts = buildParts(input, o);
  const plan = planFiles(input, o);
  const meta = { generatedAt: input.result.generatedAt, dataVersion: input.result.dataVersion };
  if (plan.length === 0) throw new Error('沒有可輸出的頁面');
  if (o.format === 'pdf') {
    const html = renderPrintHtml(
      {
        seat: [...(parts.seat ?? []), ...(parts.reserveSeat ?? [])],
        label: [...(parts.label ?? []), ...(parts.reserveLabel ?? [])],
        list: parts.study,
      },
      meta,
    );
    return [
      {
        name: `${safeName(input.exam.name)}-列印用頁面.html`,
        mime: 'text/html',
        data: html,
        desc: `${plan.reduce((a, f) => a + f.pages, 0)} 頁（${plan.map((f) => f.name.replace(/^.*?-/, '').replace(/\.pdf$/, '')).join('、')}），開啟後選「另存為 PDF」`,
        pages: plan.reduce((a, f) => a + f.pages, 0),
      },
    ];
  }
  // docx 套件較大：只在真的匯出 Word 時才載入
  const { renderDocx } = await import('./docxRender');
  const opts = { fonts: env.fonts, ...meta, boldMode: env.boldMode };
  const out: OutputFile[] = [];
  for (const f of plan) {
    const pages =
      f.key === 'seat' ? { seat: parts.seat }
      : f.key === 'label' ? { label: parts.label }
      : f.key === 'study' ? { list: parts.study }
      : f.key === 'reserveSeat' ? { seat: parts.reserveSeat }
      : { label: parts.reserveLabel };
    out.push({ name: f.name, mime: DOCX_MIME, data: await renderDocx(pages, opts), desc: f.desc, pages: f.pages });
  }
  return out;
}
