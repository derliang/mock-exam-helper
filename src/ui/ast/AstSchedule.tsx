/** ④ 時程推薦（最上面）與跨次座位沿用（最下面）（AST-3；DESIGN 10.19、D101④）。先比時程指標，選定並核准後才依它排座。 */
import { useState } from 'preact/hooks';
import type { ExamConfig } from '../../data';
import type { CandId, Candidate } from '../../core/astD99/schedule';
import { parseVersions } from '../../core/astD99/release';
import { Alert, Badge, Button, More } from '../components';
import { updateExam, type Doc } from '../store';
import { astCandidates, astInvigilators, astPlan, carrySource } from './model';

const VERDICT: Record<Candidate['verdict'], { tone?: 'ok' | 'warn' | 'danger' | 'info'; text: string }> = {
  baseline: { tone: 'info', text: '基準' }, same: { tone: 'info', text: '無改善' }, ok: { tone: 'ok', text: '可行' }, costly: { tone: 'warn', text: '可行但代價較高' }, infeasible: { tone: 'danger', text: '不可行' },
};
const dl = (a: number, b: number, unit: string): string => (a === b ? `${a}${unit}（同基準）` : `${b}${unit}（${b > a ? '＋' : '−'}${Math.abs(b - a)}）`);

export function ScheduleCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const cands = astCandidates(doc, exam);
  const base = cands[0]!;
  const sched = exam.astSchedule;
  const cur: CandId = sched?.cand ?? 'A';
  const inv = astInvigilators(exam);
  const names = new Map(exam.subjects.map((s) => [s.id, s.name]));
  const patch = (x: Partial<ExamConfig>): void => { const r = updateExam(doc, exam.id, x); if (r.ok) p.onChange(r.doc); };
  // 換時程會讓時段 id 對不上，原本的核可與鎖定一併清掉（不會悄悄留著失效的鎖定）
  const choose = (c: Candidate): void => {
    if (c.id === 'A') patch({ astSchedule: undefined, astApprovals: [], astLocks: undefined });
    else patch({ astSchedule: { cand: c.id, days: c.days }, astApprovals: [], astLocks: undefined });
  };
  const approve = (c: Candidate): void => patch({ astSchedule: { cand: c.id, days: c.days, approved: !sched?.approved } });
  const dayName = (i: number): string => ['第一天', '第二天', '第三天'][i] ?? `第 ${i + 1} 天`;
  const had = (exam.astLocks?.seats?.length ?? 0) + (exam.astLocks?.classes?.length ?? 0) + (exam.astLocks?.rooms?.length ?? 0) + (exam.astApprovals?.length ?? 0) > 0;
  return (
    <div class="card stack">
      <div><h3>時程推薦</h3><p class="small muted">先比<b>時程指標</b>（天數、時段數、同時使用的考場、監考人力），<b>選定時程之後才排座</b>，不會每個候選都完整排座。縮短天數、調整科目順序、文理同節考不同科三種都可以是候選；只有「沒有共同考生」的兩科才能同一時段，其餘標「可行但代價較高」或「不可行」。<b>未經管理者核准，不能設為正式公告。</b></p></div>
      <div class="row" style="gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px">
        <span class="label" style="margin:0">每間考場監考人數</span>
        <div class="stepper">
          <button type="button" class="icon-btn" aria-label="監考人數減一" disabled={inv <= 1} onClick={() => patch({ astInvigilators: inv - 1 })}>−</button>
          <output>{inv} 人</output>
          <button type="button" class="icon-btn" aria-label="監考人數加一" disabled={inv >= 6} onClick={() => patch({ astInvigilators: inv + 1 })}>＋</button>
        </div>
        <Badge tone={inv === 1 ? undefined : 'info'}>{inv === 1 ? '預設' : '已改'}</Badge>
        <span class="small muted" style="flex:1 1 220px">「所需監考人力」＝考場數×這個人數。預設 1 人，管理者可改（1～6），改了立刻重算下面每個候選；只影響人力指標，不影響排座，也不排誰監考。</span>
      </div>
      <div class="mgrid">
        {cands.map((c) => {
          const m = c.metrics;
          const bm = base.metrics!;
          const on = cur === c.id;
          const v = VERDICT[c.verdict];
          return (
            <div class={`mcard${on ? ' on' : ''}`} key={c.id}>
              <div class="row" style="justify-content:space-between"><h4>{c.id}　{c.title}</h4><Badge {...(v.tone ? { tone: v.tone } : {})}>{v.text}</Badge></div>
              {c.verdict !== 'infeasible' && <div class="small">{c.days.map((d, di) => <div key={di}><b>{dayName(di)}</b>：{d.map((s, si) => `時段${si + 1} ${s.map((id) => names.get(id) ?? id).join('＋')}`).join('、')}</div>)}</div>}
              {m && (
                <div class="kv small">
                  <span>天數</span><b>{m.days} 天</b><span>時段數</span><b>{m.slots} 個</b><span>同時考場峰值</span><b>{m.peakRooms} 間</b>
                  <span>監考人力（峰值／總人次）</span><b>{m.invigPeak}／{m.invigTotal} 人</b>
                </div>
              )}
              <p class="small muted">{c.note}</p>
              {m && c.id !== 'A' && c.verdict !== 'same' && <div class="small"><b>與基準的差異：</b>時段 {dl(bm.slots, m.slots, ' 個')}；同時考場峰值 {dl(bm.peakRooms, m.peakRooms, ' 間')}；監考人力峰值 {dl(bm.invigPeak, m.invigPeak, ' 人')}、總人次 {dl(bm.invigTotal, m.invigTotal, '')}。</div>}
              {c.verdict === 'infeasible' && c.blockers.length > 0 && (
                <div class="small"><b>為什麼不可行：</b>{c.blockers.map((b) => `${names.get(b.a) ?? b.a}與${names.get(b.b) ?? b.b}有 ${b.count} 位共同考生`).join('；')}，同時段無法應考。<b>不提供調整方案</b>，不虛構可行的排法。</div>
              )}
              <div class="row">
                {c.id === 'A'
                  ? <Button small kind={on ? 'primary' : 'default'} onClick={() => { if (!on) choose(c); }}>{on ? '目前使用 ✓' : '改回基準'}</Button>
                  : <>
                      <Button small kind={on ? 'primary' : 'default'} disabled={c.verdict === 'infeasible'} onClick={() => choose(c)}>{on ? '目前草案 ✓' : '設為草案'}</Button>
                      {c.verdict !== 'infeasible' && <Button small disabled={!on} onClick={() => approve(c)} title={on ? undefined : '先設為草案'}>{on && sched?.approved ? '已核准（取消）' : '管理者核准'}</Button>}
                    </>}
              </div>
            </div>
          );
        })}
      </div>
      {cur !== 'A' && <Alert tone="warn"><b>目前選的是候選 {cur}{sched?.approved ? '，已核准。' : '，還沒有核准。'}</b>{sched?.approved ? '' : '未經管理者核准，不能確認定案、不能設為正式公告。'}換時程後，原本的替代方案核可與鎖定已清掉（時段不同了），⑤ 依這個時程重排。</Alert>}
      {cur === 'A' && had && <Alert tone="info">目前用基準時程。</Alert>}
      <More title="說明：指標怎麼算">同時考場峰值＝同一時段各科需要的考場加總的最大值（每間考場的座位數依本次勾選的班級教室平均）；監考人力＝每間考場監考人數（目前 {inv} 人），峰值＝同時考場峰值×{inv}，總人次＝所有時段考場數加總×{inv}。共同考生＝兩科都報名的人；同組的兩科（例如物理×化學）多數考生都考，不能同時段。分科每科時長不鎖死，這裡不看分鐘數。</More>
      {!astPlan(doc, exam) && <p class="small muted">還沒有名單或教室，指標以目前名單算；排座結果在 ⑤。</p>}
    </div>
  );
}

/** ④ 最下面：跨次座位沿用（開關、結果四格、沒沿用的原因、上次定案座位匯入） */
export function CarryCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const on = !!exam.astCarry?.on;
  const src = carrySource(doc, exam);
  const plan = astPlan(doc, exam);
  const c = plan?.carry;
  const [msg, setMsg] = useState('');
  const patch = (x: Partial<ExamConfig>): void => { const r = updateExam(doc, exam.id, x); if (r.ok) p.onChange(r.doc); };
  const onFile = async (e: Event): Promise<void> => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = parseVersions(await f.text());
    if (!r.ok) { setMsg(r.error); return; }
    if (r.seats.length === 0) { setMsg('這個檔案裡沒有定案座位。'); return; }
    setMsg(`已匯入 ${r.seats.length} 筆上次定案座位。`);
    patch({ astCarry: { on: true, seats: r.seats } });
  };
  const reasonGroups = new Map<string, number>();
  for (const r of c?.reasons ?? []) reasonGroups.set(r.reason.replace(/上次在 \S+，/, '上次在別間教室，'), (reasonGroups.get(r.reason.replace(/上次在 \S+，/, '上次在別間教室，')) ?? 0) + 1);
  return (
    <div class="card stack">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <div><h3>跨次座位沿用</h3><p class="small muted">同一位學生在不同次模考，<b>盡量同教室、同座位；做不到就同教室</b>。<b>座號依序、同排同班優先</b>，沿用只在不衝突時才做（放在順位最後面，標籤張數之後）。上次定案的座位<b>保存在這台電腦（本機）</b>，下次直接帶入。</p></div>
        <button type="button" class={`btn${on ? ' btn-primary' : ''}`} aria-pressed={on} onClick={() => patch({ astCarry: { on: !on, ...(exam.astCarry?.seats ? { seats: exam.astCarry.seats } : {}) } })}>{on ? '沿用上次定案 ✓' : '沿用上次定案'}</button>
      </div>
      {!on && <Alert tone="info">沒有開啟：這次的座位完全依本次的規則排。</Alert>}
      {on && !src && <Alert tone="warn">找不到上次定案的座位：本機沒有已定案的分科考試，也沒有匯入檔。請匯入上次匯出的版本清單檔，或等這次定案後下次再用。</Alert>}
      {on && src && <Alert tone="info"><b>上次定案：</b>{src.from}，共 {src.seats.length} 人；存在本機。</Alert>}
      {on && (
        <div class="row"><label class="btn btn-sm">匯入上次定案座位<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>{exam.astCarry?.seats && <Button small kind="ghost" onClick={() => patch({ astCarry: { on: true } })}>改用本機的上次定案</Button>}{msg && <span class="small muted">{msg}</span>}</div>
      )}
      {on && src && c && (
        <>
          <div class="stats">
            <div><small>同教室同座位</small><strong>{c.same} 人</strong></div>
            <div><small>同教室不同座位</small><strong>{c.sameRoom} 人</strong></div>
            <div><small>不同教室</small><strong>{c.otherRoom} 人</strong></div>
            <div class={c.none > 0 ? 'warn' : ''}><small>沒沿用（沒有紀錄）</small><strong>{c.none} 人</strong></div>
          </div>
          {reasonGroups.size > 0 && <div class="small muted"><b>沒沿用到的原因：</b>{[...reasonGroups.entries()].map(([r, n]) => `${r}（${n} 人）`).join('；')}。</div>}
        </>
      )}
      <p class="small muted">匯出、匯入的檔案和 ⑥ 的「版本清單」是同一個檔，換電腦時一起帶走。</p>
    </div>
  );
}
