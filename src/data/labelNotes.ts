/** 標籤下方「注意事項」框的文字（設定頁可改）。每行一句，**粗體** 標記粗體；舊存檔沒有這個欄位時用預設。 */

export const DEFAULT_LABEL_NOTES = ['***0101**開始為第一排第一個位置以此類推。', '*請貼於桌面**右上角**。', '*請使用**透明膠帶**黏貼。'].join('\n');

/** 最多幾行、每行最多幾個字（不含 ** 標記）：框寬固定，太長會換行而撐破版面 */
export const LABEL_NOTE_MAX_LINES = 4;
export const LABEL_NOTE_MAX_CHARS = 30;

export interface NoteSeg {
  text: string;
  bold: boolean;
}
export type NoteLine = NoteSeg[];

/** 一行文字拆成粗體／一般片段；沒成對的 ** 當一般字（開頭的 * 項目符號不受影響） */
export function parseNoteLine(line: string): NoteLine {
  const segs: NoteLine = [];
  let last = 0;
  for (const m of line.matchAll(/\*\*(?!\*)(.+?)\*\*/g)) {
    if (m.index! > last) segs.push({ text: line.slice(last, m.index), bold: false });
    segs.push({ text: m[1]!, bold: true });
    last = m.index! + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), bold: false });
  return segs;
}

export const noteLineLength = (line: string): number => parseNoteLine(line).reduce((n, s) => n + [...s.text].length, 0);

/** 設定值 → 要印的行（略過空行，超過上限的行與字數截掉）；undefined 用預設，空字串＝不印注意事項框 */
export function labelNoteLines(notes: string | undefined): NoteLine[] {
  const raw = notes === undefined ? DEFAULT_LABEL_NOTES : notes;
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l)
    .slice(0, LABEL_NOTE_MAX_LINES)
    .map((l) => {
      let n = 0;
      const line = parseNoteLine(l).flatMap((s) => {
        const left = LABEL_NOTE_MAX_CHARS - n;
        if (left <= 0) return [];
        const t = [...s.text].slice(0, left).join('');
        n += [...t].length;
        return [{ text: t, bold: s.bold }];
      });
      return line;
    });
}
