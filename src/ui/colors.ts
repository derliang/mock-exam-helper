import type { CSSProperties } from 'preact/compat';

/** 班級色共 12 色（D28/D69），colorIndex 1～12；超出就循環。只輸出 CSS 變數，不寫死色碼 */
export const CLASS_COLOR_COUNT = 12;
export const CLASS_COLOR_NAMES = ['琥珀', '綠', '藍', '紫', '洋紅', '珊瑚', '青綠', '萊姆', '靛', '棕', '灰藍', '玫瑰'] as const;

export const normColor = (i: number): number => ((((Math.trunc(i) || 1) - 1) % CLASS_COLOR_COUNT) + CLASS_COLOR_COUNT) % CLASS_COLOR_COUNT + 1;

export function classColorVars(colorIndex: number): CSSProperties {
  const n = normColor(colorIndex);
  return { background: `var(--c${n}-bg)`, borderColor: `var(--c${n}-line)`, color: `var(--c${n}-ink)` };
}

/** 改色時若別班已用同色要提醒（DESIGN 二）；回傳撞色的班級序號 */
export function colorConflicts(classes: { no: number; colorIndex: number }[], no: number, colorIndex: number): number[] {
  const n = normColor(colorIndex);
  return classes.filter((c) => c.no !== no && normColor(c.colorIndex) === n).map((c) => c.no);
}
