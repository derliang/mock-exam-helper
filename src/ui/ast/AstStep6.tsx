import { useMemo, useState } from 'preact/hooks';
import type { ExamConfig, LabelPaper } from '../../data';
import { footerText } from '../../export/model';
import { renderPrintHtml } from '../../export/htmlRender';
import { safeName, type ExportFormat, type OutputFile } from '../../export/plan';
import type { FontData } from '../../export/docxRender';
import { Alert, Badge, Button, FormatPick, Seg, StepHead } from '../components';
import { AST_STEP_BLURBS } from '../nav';
import { examEntries } from '../seating';
import type { Doc } from '../store';
import { download, kb, openPrintPage } from '../pages/Step6';
import { astPlan } from './model';
import { AST_OUTPUT_ITEMS, astOutputBlockers, astOutputs, type AstOutputKey, type AstOutputs } from './output';

type Loaded = { fonts: FontData; has: (ch: string) => boolean };
type Tab = 'label' | 'ann' | 'reg' | 'study';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FILE_LABEL: Record<AstOutputKey, string> = { label: '整合標籤', ann: '班級公告', use: '每節教室用途表', reg: '每科試務清冊', study: '自習教室名單與布置標籤工作表' };
const pagesOf = (o: AstOutputs, k: AstOutputKey): number => o[k].length;

/** 把勾選的項目轉成輸出檔（Word 每項一個檔；PDF 合併成一個列印頁） */
export async function runAstExport(o: AstOutputs, keys: AstOutputKey[], format: ExportFormat, paper: LabelPaper, examName: string, fonts: () => Promise<Loaded>): Promise<OutputFile[]> {
  const meta = { generatedAt: new Date().toISOString(), dataVersion: o.version };
  const base = safeName(examName);
  const chosen = keys.filter((k) => pagesOf(o, k) > 0);
  if (chosen.length === 0) throw new Error('勾選的項目沒有可輸出的頁面');
  if (format === 'pdf') {
    const html = renderPrintHtml({ label: chosen.includes('label') ? o.label : [], table: chosen.filter((k) => k !== 'label').flatMap((k) => o[k]) }, meta);
    const n = chosen.reduce((a, k) => a + pagesOf(o, k), 0);
    return [{ name: `${base}-分科輸出-列印用頁面.html`, mime: 'text/html', data: html, desc: `${n} 頁（${chosen.map((k) => FILE_LABEL[k]).join('、')}），開啟後選「另存為 PDF」`, pages: n }];
  }
  const env = await fonts();
  const { renderDocx } = await import('../../export/docxRender');
  const opts = { fonts: env.fonts, ...meta };
  const out: OutputFile[] = [];
  for (const k of chosen) {
    const data = await renderDocx(k === 'label' ? { label: o.label } : { table: o[k] }, opts);
    out.push({ name: `${base}-${FILE_LABEL[k]}${k === 'label' ? `（${paper}）` : ''}.docx`, mime: DOCX_MIME, data, desc: k === 'label' ? `${o.label.length} 張紙（每間考場一張，${paper}）` : `${o[k].length} 頁（A4）`, pages: pagesOf(o, k) });
  }
  return out;
}

/** ⑥ 分科下載（DESIGN 10.19、D101；AST-2）：五份輸出共用同一份方案，頁尾同一個版本碼；預覽用與下載相同的頁面模型 */
export function AstStep6(p: { doc: Doc; exam: ExamConfig; onGoStep: (n: 2 | 3 | 5) => void; onExams?: () => void; loadFonts?: () => Promise<Loaded> }) {
  const { doc, exam } = p;
  const [format, setFormat] = useState<ExportFormat>('word');
  const [paper, setPaper] = useState<LabelPaper>('B4');
  const [on, setOn] = useState<Record<AstOutputKey, boolean>>({ label: true, ann: true, use: true, reg: true, study: true });
  const [tab, setTab] = useState<Tab>('label');
  const [pi, setPi] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<OutputFile[] | null>(null);
  const hasList = examEntries(doc, exam).length > 0;
  const plan = useMemo(() => astPlan(doc, exam), [doc, exam]);
  const blockers = astOutputBlockers(plan, hasList);
  const built = useMemo((): { ok: true; o: AstOutputs } | { ok: false; error: string } | undefined => {
    if (!plan || blockers.length > 0) return undefined;
    try { return { ok: true, o: astOutputs(doc, exam, plan, paper) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }, [doc, exam, plan, paper, blockers.length]);
  const outs = built?.ok ? built.o : undefined;
  const loader = p.loadFonts ?? (async () => (await import('../../export/fontLoader')).loadFonts());
  const keys = AST_OUTPUT_ITEMS.map((i) => i.key).filter((k) => on[k]);
  const hasExamNo = examEntries(doc, exam).some((e) => e.examNo);

  const go = async () => {
    if (!outs) return;
    setBusy(true); setErr('');
    try {
      const res = await runAstExport(outs, keys, format, paper, exam.name, loader);
      for (const f of res) { if (f.mime === 'text/html') { if (!openPrintPage(f)) throw new Error('瀏覽器擋住了新視窗，請允許本網站開啟彈出視窗後再按一次。'); } else download(f); }
      setResults(res);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  // 預覽：標籤＝某間考場的一張紙；其他＝某一頁
  const pages = outs ? (tab === 'label' ? outs.label : tab === 'ann' ? outs.ann : tab === 'reg' ? outs.reg : outs.study) : [];
  const idx = Math.min(pi, Math.max(0, pages.length - 1));
  const pageName = (i: number): string => {
    const pg = pages[i]!;
    return pg.kind === 'label' ? pg.roomName.replace('　整合標籤', '') : tab === 'ann' ? (pg.subtitle ?? '').split('（')[0]! : tab === 'reg' ? `${i + 1}` : `${i + 1}`;
  };
  const html = useMemo(() => {
    if (!outs || !pages[idx]) return '';
    const meta = { generatedAt: new Date().toISOString(), dataVersion: outs.version, extraCss: `html{background:#e9ecf1;zoom:${tab === 'label' ? (paper === 'A3' ? 0.38 : 0.45) : 0.5}}body{margin:0;padding:8px}.sheet{box-sizing:border-box;margin:0 auto 8px!important;box-shadow:0 1px 4px #0003}` };
    const pg = pages[idx]!;
    return pg.kind === 'label' ? renderPrintHtml({ label: [pg] }, meta) : renderPrintHtml({ table: [pg as Extract<typeof pg, { kind: 'table' }>] }, meta);
  }, [outs, tab, idx, paper]);
  const tabs: { value: Tab; label: string }[] = [{ value: 'label', label: '標籤' }, { value: 'ann', label: '班級公告' }, { value: 'reg', label: '試務清冊' }, { value: 'study', label: '自習名單' }];
  const total = keys.reduce((a, k) => a + (outs ? pagesOf(outs, k) : 0), 0);

  return (
    <section class="stack">
      <StepHead title="⑥ 下載" blurb={AST_STEP_BLURBS[5]} />
      {blockers.map((b) => (
        <Alert key={b.text} tone="danger" action={<Button small kind="primary" onClick={() => p.onGoStep(b.step)}>{b.step === 2 ? '去 ② 考試名單' : b.step === 3 ? '去 ③ 教室' : '去 ⑤ 看方案'}</Button>}><b>還不能下載：</b>{b.text}</Alert>
      ))}
      {built && !built.ok && <Alert tone="danger"><b>這份方案的標籤排不出來</b>：{built.error}。請回 ③ 調整教室的橫排或深位。</Alert>}
      {outs && <Alert tone="ok"><b>方案通過驗證，可以下載。</b>五份輸出共用同一份方案，頁尾印同一個版本碼 <Badge>{outs.version}</Badge>，標籤與班級公告不會混用不同版本。<span class="small muted">（定案、公告與版本清單屬下一批「鎖定與版本」，目前以現在的方案即時輸出。）</span></Alert>}

      <div class="card stack">
        <div><h3>下載內容</h3><p class="small muted">每一類合併成一個多頁檔案。座位一律寫「排－深位」；標籤與清冊不印鐘點，也不排監考人力。{hasExamNo ? '名單有匯入應試編號，標籤、公告與清冊都會印。' : '名單沒有匯入應試編號，所以不印這一欄。'}</p></div>
        <div class="field"><span class="label">格式</span><div class="row"><FormatPick<ExportFormat> label="格式" value={format} onChange={(v) => { setFormat(v); setResults(null); }} options={['word', 'pdf']} /></div></div>
        <div class="stack">
          {AST_OUTPUT_ITEMS.map((i) => (
            <label key={i.key} class="check" style="align-items:flex-start">
              <input type="checkbox" checked={on[i.key]} onChange={(e) => { setOn((m) => ({ ...m, [i.key]: e.currentTarget.checked })); setResults(null); }} />
              <span><b>{i.title}</b><br /><span class="small muted">{i.sub}{outs ? `（${pagesOf(outs, i.key)} 頁）` : ''}</span></span>
            </label>
          ))}
          <div class="field" style="margin-left:30px">
            <span class="label">標籤紙張（只有標籤可選；其他固定 A4）</span>
            <div class="row"><Seg<LabelPaper> label="標籤紙張" value={paper} onChange={(v) => { setPaper(v); setResults(null); }} options={[{ value: 'B4', label: 'B4（一般，6×8）' }, { value: 'A3', label: 'A3（大尺寸，7×7）' }]} /></div>
          </div>
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="muted">{format === 'pdf' ? '將開啟 1 個列印頁' : `將下載 ${keys.filter((k) => outs && pagesOf(outs, k) > 0).length} 個檔案`}，共 <b class="num">{total}</b> 頁</span>
          <button type="button" class="btn btn-primary btn-lg" disabled={!outs || busy || keys.length === 0} onClick={go}>{busy ? '產生中…' : format === 'word' ? '下載 Word 文件' : '開啟列印頁（另存 PDF）'}</button>
        </div>
        {err && <Alert tone="danger">{err}</Alert>}
        {results && (
          <div class="psec">
            <Alert tone="ok"><b>{format === 'word' ? `已下載 ${results.length} 個檔案` : '已開啟列印用頁面'}</b>{format === 'word' ? '，請看瀏覽器的下載資料夾。' : '，請在新視窗選「列印」→ 目的地選「另存為 PDF」。'}</Alert>
            <div style="overflow-x:auto"><table class="t compact"><thead><tr><th>檔案</th><th>內容</th><th>大小</th></tr></thead>
              <tbody>{results.map((f) => <tr key={f.name}><td><b>{f.name}</b></td><td class="muted">{f.desc}</td><td>{kb(typeof f.data === 'string' ? f.data.length : f.data.byteLength)}</td></tr>)}</tbody></table></div>
            <p class="small muted">本次版本碼：<Badge>{outs?.version ?? ''}</Badge>（頁尾相同，產生時間 {footerText(new Date().toISOString(), outs?.version ?? '').split('　')[0]}）</p>
            {format === 'word' && <Alert tone="warn">修改 Word 文件後，請自行重新核對；系統不會驗證改後內容。</Alert>}
            {p.onExams && <div><Button kind="primary" onClick={p.onExams}>回模擬考列表</Button></div>}
          </div>
        )}
      </div>

      {outs && (
        <div class="card stack">
          <div class="row" style="justify-content:space-between">
            <div><h3>預覽</h3><p class="small muted">與下載用同一份頁面；{tab === 'label' ? `標籤：每間考場一張紙，這間共 ${(pages[idx] as { cells?: unknown[] } | undefined)?.cells?.length ?? 0} 張（${paper === 'A3' ? 'A3 一頁 7×7＝49' : 'B4 一頁 6×8＝48'} 張）。` : `共 ${pages.length} 頁。`}</p></div>
            <Seg<Tab> label="預覽哪一份" value={tab} onChange={(v) => { setTab(v); setPi(0); }} options={tabs} />
          </div>
          {pages.length > 1 && <div class="row" style="flex-wrap:wrap"><Seg<string> label="預覽頁" value={String(idx)} onChange={(v) => setPi(Number(v))} options={pages.map((_, i) => ({ value: String(i), label: pageName(i) }))} /></div>}
          {html
            ? <iframe class="pvframe" title="下載預覽" sandbox="" srcdoc={html} style={`width:100%;height:${tab === 'label' ? 660 : 620}px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--sunken)`} />
            : <Alert tone="info">這一份沒有內容：{tab === 'study' ? '所有考生都留在原班自習，不用布置自習教室。' : '沒有可預覽的頁面。'}</Alert>}
        </div>
      )}
    </section>
  );
}
