/** 瀏覽器端載入內嵌字型（只在匯出時才下載，4.8MB 不拖慢首頁）。測試不用這個檔，直接讀檔。 */
import regularUrl from './fonts/NotoSansTC-Regular-big5.ttf?url';
import boldUrl from './fonts/NotoSansTC-Bold-core.ttf?url';
import charsUrl from './fonts/NotoSansTC-Regular-big5.chars.txt?url';
import type { FontData } from './docxRender';

let cache: Promise<{ fonts: FontData; has: (ch: string) => boolean }> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`字型檔載入失敗（${r.status}）`);
  return new Uint8Array(await r.arrayBuffer());
}

export function loadFonts(): Promise<{ fonts: FontData; has: (ch: string) => boolean }> {
  cache ??= (async () => {
    const [regular, bold, chars] = await Promise.all([fetchBytes(regularUrl), fetchBytes(boldUrl), fetch(charsUrl).then((r) => r.text())]);
    const set = new Set(chars);
    return { fonts: { regular, bold }, has: (ch: string) => set.has(ch) };
  })().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}
