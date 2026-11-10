/** 座位表／標籤表頭範本（稿 v2.22 校-54）：兩欄分開；舊存檔只有單一「表頭文字」時兩欄都帶入它 */
import type { ExamConfig, Settings } from '../data';
import { KIND_LABEL, schoolYear } from './store';

export const DEFAULT_SEAT_HEADER = '【{學年}學年第{次別}次{類型}模擬考】座位表';
export const DEFAULT_LABEL_HEADER = '{學年}學年第{次別}次{類型}模擬考';
/** 舊版預設的表頭文字（以前新存檔就是這個值，不算使用者自訂） */
const LEGACY_DEFAULTS = new Set(['', '模擬考']);

/** 兩欄的實際範本：新欄位有設就用；沒設且舊的 headerText 是使用者自訂的，兩欄都帶入；否則用預設 */
export function headerTemplates(s: Pick<Settings, 'headerText' | 'seatHeader' | 'labelHeader'>): { seat: string; label: string } {
  const legacy = s.headerText && !LEGACY_DEFAULTS.has(s.headerText.trim()) ? s.headerText : undefined;
  return { seat: s.seatHeader ?? legacy ?? DEFAULT_SEAT_HEADER, label: s.labelHeader ?? legacy ?? DEFAULT_LABEL_HEADER };
}

/** 把 {學年}{次別}{類型} 換成這次模擬考的內容 */
export function fillHeader(template: string, exam: Pick<ExamConfig, 'kind' | 'round' | 'createdAt'>): string {
  return template
    .replaceAll('{學年}', String(schoolYear(new Date(exam.createdAt))))
    .replaceAll('{次別}', exam.round ? String(exam.round) : '')
    .replaceAll('{類型}', KIND_LABEL[exam.kind]);
}
