/** 分科三階段條、版本清單、凍結守衛（AST-3；DESIGN 10.19、D101②③）。⑤⑥ 放階段卡，③④⑤ 定案後停用控制項。 */
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { ExamConfig } from '../../data';
import { diffSnap, exportVersions, finalize, parseVersions, phaseOf, publish, unfinalize } from '../../core/astD99/release';
import { seatsOfPlan } from '../../core/astD99/refine';
import { Alert, Badge, Button } from '../components';
import { download } from '../pages/Step6';
import { updateExam, type Doc } from '../store';
import { astFinalizeBlockers, astPlan } from './model';
import { astOutputs } from './output';

const NAMES = ['規劃中', '確認定案', '已公告'] as const;
const IDX = { planning: 0, final: 1, announced: 2 } as const;
const fmt = (iso: string): string => new Date(iso).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** ③④⑤：定案或公告後整段控制項停用（fieldset disabled），上方一條提示 */
export function PhaseGuard(p: { exam: ExamConfig; children: ComponentChildren }) {
  const ph = phaseOf(p.exam);
  const frozen = ph !== 'planning';
  return (
    <>
      {frozen && <Alert tone="info"><b>{ph === 'final' ? '已確認定案' : '已公告'}，這一步的設定已凍結。</b>要修改請先到 ⑤ 或 ⑥ 的「目前階段」按「解除定案{ph === 'announced' ? '、修正' : ''}」。</Alert>}
      <fieldset class="phfs stack" disabled={frozen}>{p.children}</fieldset>
    </>
  );
}

/** ⑤⑥ 的「目前階段」卡：階段條、確認定案（有待處理不能定案）、公告、解除定案（已公告要理由） */
export function PhaseCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const ph = phaseOf(exam);
  const st = IDX[ph];
  const plan = astPlan(doc, exam);
  const blockers = astFinalizeBlockers(doc, exam, plan);
  const next = (exam.astVersions?.length ?? 0) + 1;
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  const apply = (r: { ok: true; patch: Partial<ExamConfig> } | { ok: false; error: string }, clear = false): void => {
    if (!r.ok) { setErr(r.error); return; }
    const u = updateExam(doc, exam.id, r.patch);
    if (u.ok) { setErr(''); if (clear) setWhy(''); p.onChange(u.doc); }
  };
  const msg = [
    '規劃中：可以換模式、鎖定座位、核可替代方案，所有結果都是草稿，不能拿去發（只能預覽，不能下載正式檔）。',
    `已確認定案：結果凍結，標籤、班級公告、試務清冊都用同一版（第 ${next} 版）產生；要改請先「解除定案」。`,
    `已公告第 ${next - 1} 版：已經發給師生。要改請「解除定案、修正」，改好再重新發布成第 ${next} 版；舊版保留在版本清單。不會因為臨時請假自動改動已公告的版本。`,
  ][st]!;
  const doFinal = (): void => {
    if (!plan) return;
    apply(finalize(exam, blockers, seatsOfPlan(plan.out, plan.input.slots.map((s) => s.id))));
  };
  const doPublish = (): void => {
    if (!plan) return;
    apply(publish(exam, plan.out, astOutputs(doc, exam, plan).version, new Date(), why), true);
  };
  return (
    <div class="card stack">
      <div><h3>目前階段</h3><p class="small muted">{msg}</p></div>
      <ol class="stg" aria-label="排座階段">
        {NAMES.map((n, i) => <li key={n} class={i === st ? 'on' : i < st ? 'done' : ''} aria-current={i === st ? 'step' : undefined}><span class="n">{i < st ? '✓' : i + 1}</span>{n}</li>)}
      </ol>
      {st === 0 && blockers.length > 0 && <Alert tone="warn"><b>還有 {blockers.length} 項待處理，先處理才能定案：</b>{blockers.join('；')}。</Alert>}
      {st === 1 && (
        <div class="field">
          <label class="label" for="ast-why">{(exam.astVersions?.length ?? 0) > 0 ? '理由（必填，記入版本清單）' : '理由（首次公告可不填）'}</label>
          <input class="input" id="ast-why" value={why} placeholder={exam.astReopenReason ?? '例：綜合教室一當天要借給別的活動'} onInput={(e) => setWhy(e.currentTarget.value)} />
          {exam.astReopenReason && <p class="small muted">解除定案時填的理由：{exam.astReopenReason}（不另填就用它）</p>}
        </div>
      )}
      {st === 2 && <div class="field"><label class="label" for="ast-un">解除定案、修正的理由（必填）</label><input class="input" id="ast-un" value={why} placeholder="例：教室漏水，改用別間" onInput={(e) => setWhy(e.currentTarget.value)} /></div>}
      {err && <Alert tone="danger">{err}</Alert>}
      <div class="row">
        {st === 0 && <Button kind="primary" disabled={blockers.length > 0 || !plan} onClick={doFinal}>確認定案</Button>}
        {st === 1 && <><Button kind="primary" onClick={doPublish}>公告為第 {next} 版</Button><Button onClick={() => apply(unfinalize(exam, ''))}>解除定案</Button></>}
        {st === 2 && <Button onClick={() => apply(unfinalize(exam, why), true)}>解除定案、修正</Button>}
      </div>
    </div>
  );
}

/** ⑥ 版本清單：每版公告時間、修改項目、受影響考生與教室、理由；可匯出匯入（與上次定案座位一併保存） */
export function VersionCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const ph = phaseOf(exam);
  const vs = exam.astVersions ?? [];
  const [msg, setMsg] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const onFile = async (e: Event): Promise<void> => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = parseVersions(await f.text());
    if (!r.ok) { setMsg({ tone: 'danger', text: r.error }); return; }
    const u = updateExam(doc, exam.id, { astVersions: r.versions, astFinalSeats: r.seats });
    if (u.ok) { setMsg({ tone: 'ok', text: `已匯入 ${r.versions.length} 個版本與 ${r.seats.length} 筆定案座位。` }); p.onChange(u.doc); }
  };
  return (
    <div class="card stack">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <div><h3>版本清單</h3><p class="small muted">每次公告記一版：公告時間、修改項目、受影響的考生與教室、理由。<b>標籤與班級公告永遠用同一版，不會混用。</b>版本清單存在這台電腦（本機），可以匯出、匯入，與「上次定案座位」一併保存。</p></div>
        <div class="row">
          <Button small onClick={() => download({ name: `${exam.name}-分科版本清單.json`, mime: 'application/json', data: exportVersions(exam), desc: '', pages: 0 })}>匯出版本清單</Button>
          <label class="btn btn-sm">匯入<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>
        </div>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div class="scroll">
        <table class="t compact">
          <thead><tr><th>版本</th><th>狀態</th><th>公告時間</th><th>修改項目</th><th>受影響（考生／教室）</th><th>理由</th></tr></thead>
          <tbody>
            {vs.map((v, i) => (
              <tr key={v.n}>
                <td><b>第 {v.n} 版</b><br /><span class="small muted">{v.code}</span></td>
                <td>{i === vs.length - 1 && ph === 'announced' ? <Badge tone="ok">目前公告</Badge> : <Badge>已被取代</Badge>}</td>
                <td>{fmt(v.at)}</td>
                <td>{v.changes}{i > 0 && <><br /><button type="button" class="linkbtn" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? '收起差異' : '看與上一版的差異'}</button></>}</td>
                <td>{v.affected.students} 位考生／{v.affected.rooms.length ? v.affected.rooms.join('、') : '—'}</td>
                <td>{v.reason}{open === i && i > 0 && <div class="small muted" style="margin-top:6px">{diffSnap(vs[i - 1]!.snap, v.snap).students.slice(0, 40).join('、')}{diffSnap(vs[i - 1]!.snap, v.snap).students.length > 40 ? '…' : ''}</div>}</td>
              </tr>
            ))}
            {ph !== 'announced' && (
              <tr class="vdraft"><td><b>第 {vs.length + 1} 版</b></td><td><Badge tone={ph === 'final' ? 'info' : 'warn'}>{ph === 'final' ? '已定案，待公告' : '規劃中'}</Badge></td><td>—</td><td class="small muted">公告時填入</td><td class="small muted">公告時依修改項目計算</td><td class="small muted">公告時填入</td></tr>
            )}
            {vs.length === 0 && ph === 'announced' && <tr><td colSpan={6} class="muted">還沒有版本。</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
