/** 版本資訊：值由 package.json 在建置時經 vite define 注入（vite.config.ts），此處不寫死 */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

export const APP_NAME = '模擬考小幫手';
/** 版權人：使用者 2026-11-08 裁示全站統一為公開作者識別 derliang（與版權頁頁尾一致） */
export const COPYRIGHT_HOLDER = 'derliang';
export const COPYRIGHT_YEAR = 2026;

const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** '0.1.0-beta.1' → 'v0.1.0-beta.1'；格式不對時回傳 'v?'，不讓頁尾壞掉 */
export function formatVersion(raw: string): string {
  return SEMVER.test(raw) ? `v${raw}` : 'v?';
}
/** 預發布標籤（beta、rc…），沒有則回傳空字串 */
export function preLabel(raw: string): string {
  const m = SEMVER.exec(raw);
  return m?.[1] ? (m[1].slice(1).split('.')[0] ?? '') : '';
}
export function copyrightText(year = COPYRIGHT_YEAR, holder = COPYRIGHT_HOLDER): string {
  return `© ${year} ${holder}`;
}

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
