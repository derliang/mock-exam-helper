import type { ExportFormat } from '../../export/plan';

export type FileKind = ExportFormat | 'excel';

/** 自繪的檔案圖示（摺角文件＋字母或符號），顏色用 tokens --fmt-*；不使用任何商標原圖（DESIGN 10.9） */
export function FormatIcon(p: { kind: FileKind; size?: number }) {
  const fill = p.kind === 'word' ? 'var(--fmt-word)' : p.kind === 'pdf' ? 'var(--fmt-pdf)' : 'var(--fmt-xls)';
  return (
    <svg viewBox="0 0 26 26" width={p.size ?? 26} height={p.size ?? 26} aria-hidden="true" focusable="false" style="flex:none">
      <path d="M5 2h11l6 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={fill} />
      <path d="M16 2v4a2 2 0 0 0 2 2h4z" fill="#fff" opacity=".4" />
      {p.kind === 'word' && <path d="M6.5 11l2 7 2.2-5.5L12.9 18l2-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />}
      {p.kind === 'pdf' && <text x="12.5" y="19" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="Noto Sans TC,sans-serif">PDF</text>}
      {p.kind === 'excel' && <path d="M8 11.5l9 7M17 11.5l-9 7" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />}
    </svg>
  );
}

const NAMES: Record<FileKind, string> = { word: 'Word', pdf: 'PDF', excel: 'Excel' };

/** 下載格式鈕：Word 藍、PDF 磚紅、Excel 綠，各帶圖示；不寫主要／輔助（DESIGN 10.9） */
export function FormatPick(p: { value: ExportFormat; onChange: (v: ExportFormat) => void; label: string }) {
  return (
    <div class="fmts" role="radiogroup" aria-label={p.label}>
      {(['word', 'pdf'] as const).map((k) => (
        <label key={k} class={`fmt ${k === 'word' ? 'w' : 'p'}`}>
          <input type="radio" name="export-format" checked={p.value === k} onChange={() => p.onChange(k)} />
          <span><FormatIcon kind={k} />{NAMES[k]}</span>
        </label>
      ))}
    </div>
  );
}
