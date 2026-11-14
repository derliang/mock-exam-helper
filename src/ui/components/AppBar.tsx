import { useState } from 'preact/hooks';

export type Theme = 'system' | 'light' | 'dark';
export const THEME_LABEL: Record<Theme, string> = { system: '跟隨系統', light: '淺色', dark: '深色' };
export const nextTheme = (t: Theme): Theme => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');

export interface AppBarItem { id: string; label: string; current?: boolean; disabled?: boolean; onClick: () => void }

/**
 * 全站品牌列（稿 v2.31，DESIGN 10.18）：左＝標誌＋名稱＋版本（回模擬考列表）；中＝主導覽；右＝外觀切換。
 * 目前所在頁：深色中性底＋底線（不用藍）。不黏頂；≤600px 導覽收進「選單」鈕，版本隱藏，外觀鈕只留圖示。
 */
export function AppBar(p: { version: string; items: AppBarItem[]; theme: Theme; onTheme: (t: Theme) => void; onHome: () => void; homeDisabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <header class={`appbar${open ? ' open' : ''}`} id="appbar">
      <button type="button" class="ab-brand" disabled={p.homeDisabled} aria-label="模擬考小幫手，回模擬考列表" onClick={() => { setOpen(false); p.onHome(); }}>
        <span class="ab-logo" aria-hidden="true">
          <svg viewBox="0 0 34 34" fill="none">
            {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
              <rect key={`${r}${c}`} x={2 + c * 10.75} y={2 + r * 10.75} width="8.5" height="8.5" rx="2" fill="currentColor" opacity={c === 2 - r ? 1 : 0.55} />
            )))}
          </svg>
        </span>
        模擬考小幫手<span class="ab-ver" title="目前版本">{p.version}</span>
      </button>
      <nav class="ab-nav" id="abnav" aria-label="主要導覽">
        {p.items.map((it) => (
          <button key={it.id} type="button" disabled={it.disabled} aria-current={it.current ? 'true' : undefined} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
        ))}
      </nav>
      <div class="ab-tools">
        <button type="button" class="btn btn-sm ab-theme" aria-label={`外觀：${THEME_LABEL[p.theme]}（按一下切換：跟隨系統、淺色、深色）`} onClick={() => p.onTheme(nextTheme(p.theme))}>◐ <span class="t">{THEME_LABEL[p.theme]}</span></button>
        <button type="button" class="btn btn-sm ab-menu" aria-expanded={open} aria-controls="abnav" onClick={() => setOpen(!open)}>選單</button>
      </div>
    </header>
  );
}
