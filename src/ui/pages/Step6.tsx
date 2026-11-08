import { useMemo, useState } from 'preact/hooks';
import type { ExamConfig, LabelPaper } from '../../data';
import { buildPickupPages } from '../../export/pickup';
import { renderPrintHtml } from '../../export/htmlRender';
import { buildLabelPages, buildSeatPages } from '../../export/model';
import { defaultOptions, planFiles, preflight, runExport, type ExportFormat, type ExportOptions, type OutputFile } from '../../export/plan';
import type { FontData } from '../../export/docxRender';
import { Alert, Badge, Button, FormatPick, Seg } from '../components';
import { enabledExportItems, useIsEnabled } from '../features';
import { prepareExport, unresolvedDiffsOf } from '../exportInput';
import { afterExport } from '../flow';
import type { Doc } from '../store';
import { defaultLabelLayout } from '../../export/model';

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

type PreviewKind = 'label' | 'seat' | 'pickup';

/** 預覽卡（原型 vS6）：用與匯出相同的版面模型，當場產生單一教室的標籤紙／座位表／領卷清單 */
function PreviewCard(p: { prepared: Extract<ReturnType<typeof prepareExport>, { ok: true }>; paper: LabelPaper; pickupOn: boolean }) {
  const [kind, setKind] = useState<PreviewKind>('label');
  const [ri, setRi] = useState(0);
  const { input } = p.prepared;
  const rooms = input.exam.classroomIds
    .map((id) => input.settings.classrooms.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && c.kind === 'class');
  const idx = Math.min(ri, Math.max(0, rooms.length - 1));
  const room = rooms[idx];
  const html = useMemo(() => {
    if (!room) return '';
    const withPaper = { ...input, exam: { ...input.exam, labelLayout: defaultLabelLayout(p.paper) } };
    const meta = { generatedAt: input.result.generatedAt, dataVersion: input.result.dataVersion, extraCss: `html{background:#e9ecf1;zoom:${kind === 'label' ? (p.paper === 'A3' ? 0.38 : 0.45) : 0.5}}body{margin:0;padding:8px}.sheet{width:${kind === 'label' ? (p.paper === 'A3' ? 297 : 250) : 210}mm;box-sizing:border-box;margin:0 auto 8px!important;box-shadow:0 1px 4px #0003}` };
    if (kind === 'label') { const pg = buildLabelPages(withPaper, 'class')[idx]; return pg ? renderPrintHtml({ label: [pg] }, meta) : ''; }
    if (kind === 'seat') { const pg = buildSeatPages(withPaper, 'class')[idx]; return pg ? renderPrintHtml({ seat: [pg] }, meta) : ''; }
    const pg = buildPickupPages(withPaper).find((t) => t.subtitle?.startsWith(room.name));
    return pg ? renderPrintHtml({ table: [pg] }, meta) : '';
  }, [input, kind, idx, p.paper, room]);
  const kinds: { value: PreviewKind; label: string }[] = [{ value: 'label', label: '標籤' }, { value: 'seat', label: '座位表' }, ...(p.pickupOn ? [{ value: 'pickup' as const, label: '領卷清單' }] : [])];
  const cap = kind === 'label'
    ? `${p.paper === 'A3' ? 'A3（297×420 mm）・7 欄 × 7 列 ＝ 49 格' : 'B4（250×353 mm）・6 欄 × 8 列 ＝ 48 格'}・格子大小固定，不隨人數變；用不到的格子空白，一張紙為限。`
    : kind === 'seat' ? 'A4 座位表，每頁附該教室的考生統計；實際檔案每間班級教室一頁。' : 'A4 領卷清單，每間教室一頁，列出每科試卷與答案卡份數。';
  return (
    <div class="card stack" style="margin-top:12px">
      <div class="row" style="justify-content:space-between">
        <div><h3>預覽</h3><p class="small muted">{room ? room.name : '沒有班級教室'}，與下載檔同一份版面。</p></div>
        <div class="row"><Seg<PreviewKind> label="預覽類型" value={kind} onChange={setKind} options={kinds} /></div>
      </div>
      {rooms.length > 1 && (
        <div class="row"><Seg<string> label="預覽教室" value={String(idx)} onChange={(v) => setRi(Number(v))} options={rooms.map((r, i) => ({ value: String(i), label: r.name }))} /></div>
      )}
      {html
        ? <iframe class="pvframe" title="下載預覽" sandbox="" srcdoc={html} style={`width:100%;height:${kind === 'label' ? 660 : 620}px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunken)`} />
        : <Alert tone="info">這間教室沒有可預覽的內容。</Alert>}
      <p class="small muted">{cap}</p>
    </div>
  );
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
  onGoStep: (n: 2 | 3 | 5) => void;
  /** 完成後「回模擬考列表」 */
  onExams?: () => void;
  /** 測試或預覽可注入字型載入；預設延遲載入真實字型 */
  loadFonts?: () => Promise<Loaded>;
}) {
  const { exam } = p;
  const [o, setO] = useState<ExportOptions>(() => defaultOptions(exam.labelLayout.paper));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [extraOn, setExtraOn] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<OutputFile[] | null>(null);
  const [fontState, setFontState] = useState<Loaded | null>(null);
  const junior = exam.division === 'junior';
  const pickupOn = useIsEnabled('pickup-list', exam.kind);
  const set = (patch: Partial<ExportOptions>) => { setO((x) => ({ ...x, ...patch })); setResults(null); };

  // 選用功能多出的匯出項（D75）：功能關閉時完全不出現
  const extras = enabledExportItems({ settings: p.doc.settings, examKind: exam.kind });
  const chosenExtras = extras.filter((x) => extraOn[x.key]);
  const mainNone = !o.seat && !o.label && !o.study && !o.reserve;
  const diffs = p.unresolvedDiffs ?? unresolvedDiffsOf(p.doc, exam);
  const prepared = useMemo(() => prepareExport(p.doc, exam), [p.doc, exam]);
  const loader = p.loadFonts ?? (async () => (await import('../../export/fontLoader')).loadFonts());

  // 字集檢查要字型字集；先用「全部通過」，載入後再重算（使用者按匯出前就會載入）
  const has = fontState?.has ?? (() => true);
  const issues = (prepared.ok ? preflight(prepared.input, o, { stale: p.stale, unresolvedDiffs: diffs }, has) : [])
    .filter((i) => !(mainNone && chosenExtras.length > 0 && i.text.startsWith('還沒勾選')));
  const blocked = !prepared.ok || issues.some((i) => i.level === 'block');
  const files = prepared.ok && !blocked && !mainNone ? planFiles(prepared.input, o) : [];

  const go = async () => {
    if (!prepared.ok) return;
    setBusy(true);
    setErr('');
    try {
      const env = fontState ?? (await loader());
      setFontState(env);
      // 載入字型後字集檢查可能出現新警告：有新的擋下項目就停
      const again = preflight(prepared.input, o, { stale: p.stale, unresolvedDiffs: diffs }, env.has);
      if (again.some((i) => i.level === 'block')) return;
      const out = mainNone ? [] : await runExport(prepared.input, o, { fonts: env.fonts });
      for (const x of chosenExtras) out.push(...(await x.run({ doc: p.doc, exam, format: o.format })));
      for (const f of out) {
        if (f.mime === 'text/html') {
          if (!openPrintPage(f)) throw new Error('瀏覽器擋住了新視窗，請允許本網站開啟彈出視窗後再按一次。');
        } else download(f);
      }
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
      <div class="card stephead"><div><h2>⑥ 下載</h2><p class="small muted">下載座位表、標籤與名單；要列印請開下載的檔案。</p></div></div>
      {!prepared.ok && (
        <div style="margin-top:12px"><Alert tone="danger">
          <b>還不能下載：</b>
          <ul>{prepared.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          <div class="row" style="margin-top:8px">
            {prepared.errors.some((e) => e.startsWith('缺考試名單')) && <Button small kind="primary" onClick={() => p.onGoStep(2)}>去 ② 匯入考試名單</Button>}
            {prepared.errors.some((e) => e.startsWith('缺排座結果') || e.startsWith('排座已過期')) && <Button small kind="primary" onClick={() => p.onGoStep(5)}>回 ⑤ 排座</Button>}
            {prepared.errors.some((e) => e.startsWith('缺教室')) && <Button small kind="primary" onClick={() => p.onGoStep(3)}>去 ③ 勾選教室</Button>}
          </div>
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
      {prepared.ok && !blocked && issues.length === 0 && <div style="margin-top:12px"><Alert tone="ok"><b>檢查通過：</b>可以下載。</Alert></div>}

      <div class="card stack" style="margin-top:12px">
        <div>
          <h3>下載內容</h3>
          <p class="small muted">每一類合併成<b>一個多頁檔案</b>，不是一個座位表或一個標籤一個檔。Word 方便你編輯，每類下載一個檔；PDF 是先開啟列印用頁面，再用瀏覽器的列印另存成 PDF，適合確定不再編輯、想避免格式跑掉時使用。</p>
        </div>
        <div class="field"><span class="label">格式</span>
          <div class="row"><FormatPick<ExportFormat> label="格式" value={o.format} onChange={(v) => set({ format: v })} options={['word', 'pdf']} /></div>
        </div>
        <div class="stack">
          {ck('seat', '座位表（A4）', '合併成一個檔案，每間班級教室一頁；每頁附該教室的考生統計')}
          {ck('label', '標籤', '合併成一個檔案，每間班級教室一張紙；標籤格大小固定，每個班級一種底色')}
          <div class="field" style="margin-left:30px">
            <span class="label">標籤紙張（只有標籤可選；座位表與名單固定 A4）</span>
            <div class="row"><Seg<LabelPaper> label="標籤紙張" value={o.paper} onChange={(v) => set({ paper: v })} options={[{ value: 'B4', label: 'B4（一般，6×8）' }, { value: 'A3', label: 'A3（大尺寸，7×7）' }]} /></div>
            <span class="hint">兩種紙張的標籤格大小各自固定，不隨班級人數變；用不到的格子空白。</span>
          </div>
          {!junior && ck('study', '抽離自習名單（A4）', '合併成一個檔案，每科一頁；只有名單與人數，不出座位表與標籤')}
          {!junior && ck('reserve', '預備教室的座位表（A4）', '抽離考試，每科每間預備教室一頁；要同時勾選上面的「標籤」，才會一併產生預備教室標籤')}
        </div>
        {extras.length > 0 && (
          <div class="stack">
            <span class="label">選用功能的輸出</span>
            {extras.map((x) => (
              <label key={x.key} class="check" style="align-items:flex-start">
                <input type="checkbox" checked={!!extraOn[x.key]} onChange={(e) => { setExtraOn((m) => ({ ...m, [x.key]: e.currentTarget.checked })); setResults(null); }} />
                <span><b>{x.title}</b><br /><span class="small muted">{x.sub}</span></span>
              </label>
            ))}
          </div>
        )}
        <div class="row" style="justify-content:space-between">
          <span class="muted">{o.format === 'pdf' ? '將開啟' : '將下載'} <b class="num">{(o.format === 'pdf' && files.length ? 1 : files.length) + chosenExtras.length}</b> {o.format === 'pdf' ? '個列印頁' : '個檔案'}</span>
          <button type="button" class="btn btn-primary btn-lg" disabled={blocked || busy || (files.length === 0 && chosenExtras.length === 0)} onClick={go}>
            {busy ? '產生中…' : p.stale ? '需先重新排座' : o.format === 'word' ? '下載 Word' : '開啟列印頁（存成 PDF）'}
          </button>
        </div>
        <p class="small muted">要列印時，請開啟下載的 Word 檔（或另存的 PDF）再列印，本程式不直接列印。頁尾印有產生時間與資料版本碼，可事後核對表是否對應現在的名單與設定。</p>
      </div>

      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}

      {prepared.ok && <PreviewCard prepared={prepared} paper={o.paper} pickupOn={pickupOn} />}

      {results && (
        <div class="card stack" style="margin-top:12px">
          <Alert tone="ok">
            <b>{o.format === 'word' ? `已下載 ${results.length} 個檔案` : '已開啟列印用頁面'}</b>
            {o.format === 'word' ? '，請看瀏覽器的下載資料夾。' : '，請在新視窗選「列印」→ 目的地選「另存為 PDF」。'}
          </Alert>
          <div style="overflow-x:auto"><table class="t compact">
            <thead><tr><th>檔案</th><th>內容</th><th>大小</th></tr></thead>
            <tbody>{results.map((f) => (
              <tr key={f.name}><td><b>{f.name}</b></td><td class="muted">{f.desc}</td><td>{kb(typeof f.data === 'string' ? f.data.length : f.data.byteLength)}</td></tr>
            ))}</tbody>
          </table></div>
          <p class="small muted">資料版本碼：<Badge>{prepared.ok ? prepared.input.result.dataVersion : ''}</Badge>（印在每頁頁尾）</p>
          {o.format === 'word' && <Alert tone="warn">Word 檔下載後若手動編輯，就不再受驗證器保護，請自行重新核對。</Alert>}
          <div>
            <h3>接下來該做什麼</h3>
            <ol class="nextlist">
              {afterExport(o.format, o.paper).map((i) => (
                <li key={i.text}>{i.text}{' '}
                  {i.step && <Button small onClick={() => p.onGoStep(i.step as 5)}>回 ⑤ 排座</Button>}
                  {i.nav && p.onExams && <Button small kind="primary" onClick={p.onExams}>回模擬考列表</Button>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
