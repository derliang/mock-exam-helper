import { useMemo, useState } from 'preact/hooks';
import type { ExamConfig, LabelPaper } from '../../data';
import { defaultOptions, planFiles, preflight, runExport, type ExportFormat, type ExportOptions, type OutputFile } from '../../export/plan';
import type { FontData } from '../../export/docxRender';
import { Alert, Badge, Button, Seg } from '../components';
import { prepareExport } from '../exportInput';
import type { Doc } from '../store';

type Loaded = { fonts: FontData; has: (ch: string) => boolean };

/** 瀏覽器下載一個檔案（存到瀏覽器的下載資料夾） */
function download(f: OutputFile): void {
  const blob = new Blob([f.data as BlobPart], { type: f.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** PDF：開新視窗顯示列印用頁面，使用者選「另存為 PDF」（D29，不直接列印 D69） */
function openPrintPage(f: OutputFile): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(f.data as string);
  w.document.close();
  return true;
}

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** ⑥ 匯出（DESIGN 10.4、D29、D57、D69）：Word 為主、PDF 為輔；每類合併成一個多頁檔 */
export function Step6(p: {
  doc: Doc;
  exam: ExamConfig;
  /** 排座結果過期（⑤ 提供；目前匯出頁即時排座，未提供視為 false） */
  stale?: boolean;
  /** 考試名單差異未處理數（② 提供） */
  unresolvedDiffs?: number;
  onGoStep: (n: 2 | 5) => void;
  /** 測試或預覽可注入字型載入；預設延遲載入真實字型 */
  loadFonts?: () => Promise<Loaded>;
}) {
  const { exam } = p;
  const [o, setO] = useState<ExportOptions>(() => defaultOptions(exam.labelLayout.paper));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<OutputFile[] | null>(null);
  const [fontState, setFontState] = useState<Loaded | null>(null);
  const junior = exam.division === 'junior';
  const set = (patch: Partial<ExportOptions>) => { setO((x) => ({ ...x, ...patch })); setResults(null); };

  const prepared = useMemo(() => prepareExport(p.doc, exam, new Date().toISOString()), [p.doc, exam]);
  const loader = p.loadFonts ?? (async () => (await import('../../export/fontLoader')).loadFonts());

  // 字集檢查要字型字集；先用「全部通過」，載入後再重算（使用者按匯出前就會載入）
  const has = fontState?.has ?? (() => true);
  const issues = prepared.ok ? preflight(prepared.input, o, { stale: p.stale, unresolvedDiffs: p.unresolvedDiffs }, has) : [];
  const blocked = !prepared.ok || issues.some((i) => i.level === 'block');
  const files = prepared.ok && !blocked ? planFiles(prepared.input, o) : [];

  const go = async () => {
    if (!prepared.ok) return;
    setBusy(true);
    setErr('');
    try {
      const env = fontState ?? (await loader());
      setFontState(env);
      // 載入字型後字集檢查可能出現新警告：有新的擋下項目就停
      const again = preflight(prepared.input, o, { stale: p.stale, unresolvedDiffs: p.unresolvedDiffs }, env.has);
      if (again.some((i) => i.level === 'block')) return;
      const out = await runExport(prepared.input, o, { fonts: env.fonts });
      if (o.format === 'word') out.forEach(download);
      else if (!openPrintPage(out[0]!)) throw new Error('瀏覽器擋住了新視窗，請允許本網站開啟彈出視窗後再按一次。');
      setResults(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const ck = (key: 'seat' | 'label' | 'study' | 'reserve', title: string, sub: string) => (
    <label class="check" style="align-items:flex-start">
      <input type="checkbox" checked={o[key]} onChange={(e) => set({ [key]: e.currentTarget.checked } as Partial<ExportOptions>)} />
      <span><b>{title}</b><br /><span class="small muted">{sub}</span></span>
    </label>
  );

  return (
    <section>
      <h2>⑥ 匯出</h2>
      {!prepared.ok && (
        <div style="margin-top:12px"><Alert tone="danger">
          <b>還不能匯出：</b>
          <ul>{prepared.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Alert></div>
      )}
      {issues.map((i) => (
        <div key={i.text} style="margin-top:12px">
          <Alert tone={i.level === 'block' ? 'danger' : 'warn'}
            action={i.text.includes('排座') ? <Button small kind="primary" onClick={() => p.onGoStep(5)}>回 ⑤ 排座</Button> : i.text.includes('② ') ? <Button small onClick={() => p.onGoStep(2)}>回 ② 處理</Button> : undefined}>
            {i.text}
          </Alert>
        </div>
      ))}
      {prepared.ok && !blocked && issues.length === 0 && <div style="margin-top:12px"><Alert tone="ok"><b>檢查通過：</b>可以匯出。</Alert></div>}

      <div class="card stack" style="margin-top:12px">
        <div>
          <h3>匯出內容</h3>
          <p class="small muted">每一類合併成<b>一個多頁檔案</b>，不是一個座位表或一個標籤一個檔。Word 為主要成品，方便你編輯；PDF 給確定不再編輯、想避免格式跑掉時使用（D29）。</p>
        </div>
        <div class="field"><span class="label">格式</span>
          <Seg<ExportFormat> label="格式" value={o.format} onChange={(v) => set({ format: v })} options={[{ value: 'word', label: 'Word（主要）' }, { value: 'pdf', label: 'PDF（輔助）' }]} />
        </div>
        <div class="stack">
          {ck('seat', '座位表（A4）', '合併成一個檔案，每間班級教室一頁；每頁附該教室的考生統計')}
          {ck('label', '標籤', '合併成一個檔案，每間班級教室一張紙；標籤格大小固定，每個班級一種底色')}
          <div class="field" style="margin-left:30px">
            <span class="label">標籤紙張（只有標籤可選；座位表與名單固定 A4）</span>
            <Seg<LabelPaper> label="標籤紙張" value={o.paper} onChange={(v) => set({ paper: v })} options={[{ value: 'B4', label: 'B4（一般，6×8）' }, { value: 'A3', label: 'A3（大尺寸，7×7）' }]} />
            <span class="hint">兩種紙張的標籤格大小各自固定，不隨班級人數變；用不到的格子空白。</span>
          </div>
          {!junior && ck('study', '抽離自習名單（A4）', '合併成一個檔案，每科一頁；只有名單與人數，不出座位表與標籤')}
          {!junior && ck('reserve', '預備教室的座位表（A4）與標籤', '抽離考試，每科每間預備教室一頁；有勾標籤時一併產生預備教室標籤')}
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="muted">將產生 <b class="num">{o.format === 'pdf' && files.length ? 1 : files.length}</b> 個檔案</span>
          <button type="button" class="btn btn-primary btn-lg" disabled={blocked || busy || files.length === 0} onClick={go}>
            {busy ? '產生中…' : p.stale ? '排座過期，先重新排座' : o.format === 'word' ? '匯出 Word' : '開啟列印頁（存成 PDF）'}
          </button>
        </div>
        <p class="small muted">要列印時，請開啟匯出的 Word 或 PDF 再列印，本程式不直接列印（D69）。頁尾印有產生時間與資料版本碼，可事後核對表是否對應現在的名單與設定（D66）。</p>
      </div>

      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}

      {results && (
        <div class="card stack" style="margin-top:12px">
          <Alert tone="ok">
            <b>{o.format === 'word' ? `已匯出 ${results.length} 個檔案` : '已開啟列印用頁面'}</b>
            {o.format === 'word' ? '，請看瀏覽器的下載資料夾。' : '，請在新視窗選「列印」→ 目的地選「另存為 PDF」。'}
          </Alert>
          <div style="overflow-x:auto"><table class="t compact">
            <thead><tr><th>檔案</th><th>內容</th><th>大小</th></tr></thead>
            <tbody>{results.map((f) => (
              <tr key={f.name}><td><b>{f.name}</b></td><td class="muted">{f.desc}</td><td>{kb(typeof f.data === 'string' ? f.data.length : f.data.byteLength)}</td></tr>
            ))}</tbody>
          </table></div>
          <p class="small muted">資料版本碼：<Badge>{prepared.ok ? prepared.input.result.dataVersion : ''}</Badge>（印在每頁頁尾）</p>
          {o.format === 'word' && <Alert tone="warn">Word 檔匯出後若手動編輯，就不再受驗證器保護（D29）。</Alert>}
        </div>
      )}
    </section>
  );
}
