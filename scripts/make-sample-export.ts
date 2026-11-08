/** 產生假資料抽驗檔：npx vite-node scripts/make-sample-export.ts <輸出資料夾> [separate-family|embed-bold] */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildDetachList, buildLabelPages, buildSeatPages, renderDocx, renderPrintHtml } from '../src/export';
import { makeFixture } from '../src/export/fixtures';

const out = process.argv[2] ?? 'sample-out';
const boldMode = (process.argv[3] ?? 'separate-family') as 'separate-family' | 'embed-bold';
const fd = new URL('../src/export/fonts/', import.meta.url);
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fd))),
  bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fd))),
};
const f = makeFixture();
const meta = { generatedAt: new Date().toISOString(), dataVersion: 'SAMPLE01', boldMode, fonts };
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/座位表-${boldMode}.docx`, await renderDocx({ seat: buildSeatPages(f) }, meta));
writeFileSync(`${out}/標籤-${boldMode}.docx`, await renderDocx({ label: buildLabelPages(f) }, meta));
writeFileSync(`${out}/抽離名單-${boldMode}.docx`, await renderDocx({ list: buildDetachList(f) }, meta));
writeFileSync(`${out}/列印預覽.html`, renderPrintHtml({ seat: buildSeatPages(f), label: buildLabelPages(f), list: buildDetachList(f) }, meta));
console.log('done', out);
