import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';

// 建置時的 CSS 警告（例如括號不平衡會讓壓縮器丟掉深色樣式）要變成測試失敗
const files = ['docs/design/tokens.css', 'src/styles/app.css'];
describe('CSS 語法', () => {
  for (const f of files) {
    it(`${f} 壓縮無警告`, async () => {
      const r = await transform(readFileSync(f, 'utf8'), { loader: 'css', minify: true });
      expect(r.warnings.map((w) => w.text)).toEqual([]);
    });
  }
  it('合併後（建置的實際輸入）也無警告', async () => {
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const r = await transform(all, { loader: 'css', minify: true });
    expect(r.warnings).toEqual([]);
  });
});

describe('類別撞名', () => {
  it('班級教室列不得再用開關軌道的 .trk（fix-v2：曾使整列塌成 46×26）', () => {
    const css = readFileSync('src/styles/app.css', 'utf8');
    const room = readFileSync('src/ui/components/RoomList.tsx', 'utf8');
    expect(css).not.toMatch(/\.roomrow\.trk/);
    expect(room).not.toMatch(/'\s*trk\s*'/);
    expect(css).toMatch(/\.roomrow\.roomrow-cls\{/);
    expect(css).toMatch(/^\.trk\{width:46px;height:26px/m);
  });
});
