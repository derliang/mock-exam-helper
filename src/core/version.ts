/**
 * 資料版本碼（D66）：把排座用到的名單與設定做穩定雜湊，印在輸出頁尾，
 * 事後可核對貼出去的表是否對應現在的名單與設定。同樣資料一定得到同一碼，
 * 物件鍵的順序不影響結果；陣列順序會影響（順序本身就是資料，例如教室順序）。
 */
import type { DataVersion } from '../data/types';

/** 穩定序列化：物件鍵排序，undefined 欄位略過 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** FNV-1a 64 位元（以兩個 32 位元模擬），輸出 16 碼大寫十六進位 */
export function fnv1a64(text: string): string {
  let h1 = 0x84222325;
  let h2 = 0xcbf29ce4;
  const bytes = new TextEncoder().encode(text);
  for (const b of bytes) {
    h1 = (h1 ^ b) >>> 0; // ^ 結果是有號 32 位元，要轉回無號
    // 乘以 FNV 64 位元質數 0x100000001b3：低位 × 0x1b3，高位 × 0x1b3 ＋ 低位 × 0x100
    const lo = h1 * 0x1b3;
    const hi = h2 * 0x1b3 + h1 * 0x100;
    h1 = lo >>> 0;
    h2 = (hi + Math.floor(lo / 0x100000000)) >>> 0;
  }
  return (h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0')).toUpperCase();
}

/** 版本碼：12 碼，每 4 碼一組，例 "1A2B-3C4D-5E6F" */
export function dataVersion(input: unknown): DataVersion {
  const hex = fnv1a64(stableStringify(input)).slice(0, 12);
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
