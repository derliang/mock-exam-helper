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
    expect(css).toMatch(/\.roomrow\.hastrack\{/);
    expect(css).toMatch(/^\.trk\{width:46px;height:26px/m);
  });
});

describe('版面溢出（fix-v3）', () => {
  const css = readFileSync('src/styles/app.css', 'utf8');
  it('教室列 hastrack 最終為可換行 flex（不得回到固定寬 7 欄 grid 而撐出卡片）', () => {
    const idx = css.lastIndexOf('.roomrow.hastrack{');
    expect(css.slice(idx, idx + 80)).toMatch(/display:flex;flex-wrap:wrap/);
  });
  it('.rw 子項 min-width:0（grid 子項不被內容撐出卡片，V3-1 根因）', () => {
    expect(css).toMatch(/\.rw>\*\{min-width:0\}/);
  });
  it('窄螢幕分段鈕文字可換行', () => {
    expect(css).toMatch(/max-width:480px\)\{\.seg\{width:100%\}\.seg button\{[^}]*white-space:normal/);
  });
});
