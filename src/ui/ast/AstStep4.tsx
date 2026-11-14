import type { ExamConfig } from '../../data';
import type { PlanMetrics, PlanMode } from '../../core/astD99/contract';
import { Alert, Button, StepHead } from '../components';
import { AST_STEP_BLURBS } from '../nav';
import { updateExam, type Doc } from '../store';
import { examEntries } from '../seating';
import { astModeOf, astPlan, astSlots, MODE_LABEL } from './model';

const MODES: { id: PlanMode; badge?: string; intro: string; order: string[] }[] = [
  { id: 'fewest-rooms', badge: '預設', intro: '用最少的教室（教室多＝監考人力多）。願意讓更多人換教室。', order: ['用到的教室總數（兩天去重；原班與綜合教室各算 1 間）', '被抽離的原班非應考者人次', '各考場人數平均（整班為單位，盡量不拆班）', '同排混科次數', '自習地點穩定（同人跨節盡量同一間）', '標籤張數'] },
  { id: 'least-movement', intro: '讓最少人離開原班教室（應考者與自習者各算 1 人次），教室可以多用幾間。', order: ['離開原班人次', '跨節換教室次數', '用到的教室總數', '各考場人數平均', '同排混科次數', '標籤張數'] },
];

interface Row { label: string; note?: string; get: (m: PlanMetrics) => number; show?: (m: PlanMetrics) => string; low?: boolean }

/** 方案比較表的列（DESIGN 10.14、D103）；low＝越小越好，較小者粗體；三項新指標只顯示、不參與粗體標示（D103） */
const GROUP1: Row[] = [
  { label: '用到的教室總數', note: '有考試或接收抽離自習的教室，兩天去重', get: (m) => m.roomsTotal, low: true },
  { label: '考場教室數／自習教室數', note: '分開算；同一間教室若某時段考試、另一時段自習，兩邊都算，所以兩數相加可能大於上一列', get: (m) => m.examRooms, show: (m) => `${m.examRooms} 間／${m.studyRooms} 間` },
  { label: '被抽離的原班非應考者人次', note: '原班被徵用成考場，不考的人要離開', get: (m) => m.displaced, low: true },
  { label: '離開原班人次', note: '應考者、自習者各算 1 人次', get: (m) => m.leaveHome, low: true },
  { label: '跨節換教室次數', note: '同一人相鄰兩個時段所在教室不同（回原班不算換）', get: (m) => m.roomChanges, low: true },
  { label: '跨科換座位次數', note: '同一人相鄰兩個考試時段，座位不同的次數', get: (m) => m.seatChanges },
  { label: '需跨教室學生數', note: '兩天內至少有一個時段不在自己班教室的學生', get: (m) => m.crossRoomStudents, show: (m) => `${m.crossRoomStudents} 人` },
  { label: '各考場人數最大落差', note: '同一時段多間考場的人數差', get: (m) => m.balanceGap, show: (m) => `${m.balanceGap} 人` },
];
const GROUP2: Row[] = [
  { label: '混科教室數／同排混科排數', note: '標準兩天、共 8 個時段，一時段一科，不會混科；文理同節時才會出現', get: (m) => m.mixedRooms, show: (m) => `${m.mixedRooms} 間／${m.mixedRows} 排` },
  { label: '標籤張數', note: '每個被用到的座位一張，各時段一行', get: (m) => m.labels, low: true },
  { label: '同一座位最多幾個人用過', note: '同一座位換人坐，標籤要列多節', get: (m) => m.maxSeatUsers, show: (m) => `${m.maxSeatUsers} 人` },
  { label: '發卷區段數', note: '每間考場每個時段的科目分段數（單科＝1 段）', get: (m) => m.dispatchSegments, low: true },
];

/** ④ 排座模式與方案（分科，DESIGN 10.14、稿 v2.34）：兩張模式卡＋方案比較表＋同分決勝說明 */
export function AstStep4(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep: (n: 2 | 3) => void }) {
  const { doc, exam } = p;
  const mode = astModeOf(exam);
  const hasList = examEntries(doc, exam).length > 0;
  const plans = { 'fewest-rooms': astPlan(doc, exam, 'fewest-rooms'), 'least-movement': astPlan(doc, exam, 'least-movement') };
  const met = (m: PlanMode): PlanMetrics | undefined => plans[m]?.out.metrics;
  const choose = (m: PlanMode) => { const r = updateExam(doc, exam.id, { astMode: m }); if (r.ok) p.onChange(r.doc); };
  const a = met('fewest-rooms');
  const b = met('least-movement');
  const slots = astSlots(doc, exam);

  const row = (r: Row) => {
    const va = a ? r.get(a) : undefined;
    const vb = b ? r.get(b) : undefined;
    const ca = r.low && va !== undefined && vb !== undefined && va < vb ? ' best' : '';
    const cb = r.low && va !== undefined && vb !== undefined && vb < va ? ' best' : '';
    return (
      <tr key={r.label}>
        <td>{r.label}{r.note && <><br /><span class="small muted">{r.note}</span></>}</td>
        <td class={`n${ca}`}>{a ? (r.show ? r.show(a) : va) : '—'}</td>
        <td class={`n${cb}`}>{b ? (r.show ? r.show(b) : vb) : '—'}</td>
      </tr>
    );
  };

  return (
    <section class="stack">
      <StepHead title="④ 排座模式與方案" blurb={AST_STEP_BLURBS[3]} />
      {!hasList && (
        <Alert tone="info" action={<Button onClick={() => p.onStep(2)}>前往 ② 考試名單</Button>}>
          <b>還沒有考試名單。</b>兩種模式的結果要依考試名單算，請先到 ② 匯入考生名單；選好的模式會保留。
        </Alert>
      )}
      {hasList && !plans[mode] && (
        <Alert tone="info" action={<Button onClick={() => p.onStep(3)}>前往 ③ 教室與自習空間</Button>}>
          <b>還沒有勾選可用的教室。</b>方案要依教室算，請先到 ③ 勾選班級教室與綜合教室。
        </Alert>
      )}

      <div class="card stack">
        <div><h3>選擇排座模式</h3><p class="small muted">兩種模式都提供，由你選；<b>預設少教室優先</b>，可以隨時切換，切換後 ⑤ 的教室用途表會重排。分科<b>不再使用「X＋科目」標示</b>，也不再有「標少數」的設定。</p></div>
        <div class="mgrid">
          {MODES.map((m) => {
            const on = mode === m.id;
            const mt = met(m.id);
            return (
              <div class={`mcard${on ? ' on' : ''}`} key={m.id}>
                <div class="row" style="justify-content:space-between"><h4>{MODE_LABEL[m.id]}</h4>{m.badge && <span class="badge b-acc">{m.badge}</span>}</div>
                <p class="small muted">{m.intro}</p>
                <ol class="small mord">{m.order.map((x) => <li key={x}>{x}</li>)}</ol>
                <p class="small"><b>這份名單的結果：</b>{mt ? `用 ${mt.roomsTotal} 間教室、離開原班 ${mt.leaveHome} 人次、換教室 ${mt.roomChanges} 次` : '匯入名單並勾選教室後才算得出來'}</p>
                <button type="button" class={`btn${on ? ' btn-primary' : ''}`} aria-pressed={on} onClick={() => choose(m.id)}>{on ? '目前使用 ✓' : '改用這個'}</button>
              </div>
            );
          })}
        </div>
        <Alert tone="info"><b>兩個方案完全同分時：</b>固定規則決勝，同樣的資料永遠得到同樣的結果。①用到的教室裡，班級教室依班序靠前者優先，綜合教室排後；②同一時段裡，考場的編號小者先排；③仍相同才比學號小者先排座。</Alert>
      </div>

      <div class="card stack">
        <div><h3>方案比較</h3><p class="small muted">用這份名單，兩種模式各算一次。選哪個由你決定，程式只負責把代價算清楚。</p></div>
        <div class="scroll">
          <table class="t compact cmpt">
            <thead><tr>
              <th>指標</th>
              <th class={mode === 'fewest-rooms' ? 'selc' : ''}>少教室優先{mode === 'fewest-rooms' ? '（使用中）' : ''}</th>
              <th class={mode === 'least-movement' ? 'selc' : ''}>少移動優先{mode === 'least-movement' ? '（使用中）' : ''}</th>
            </tr></thead>
            <tbody>
              <tr class="grp"><td colSpan={3}>取捨指標（越小越好，粗體＝較少）</td></tr>
              {GROUP1.map(row)}
              <tr class="grp"><td colSpan={3}>試務複雜度（供比較；數字越小越單純）</td></tr>
              {GROUP2.map(row)}
            </tbody>
          </table>
        </div>
        <p class="small muted"><b>「跨科換座位次數」「考場教室數／自習教室數」「需跨教室學生數」只顯示，不參與「較少」粗體標示，也不影響排座順位</b>（D103）。</p>
        <Alert tone="info"><b>時程：</b>以「節次與時長」的分科時程為準（目前 {slots.length} 個時段、{slots.length ? `${slots.map((s) => s.subjectLabel).join('、')}` : '尚無'}）。先比時程指標再排座屬下一批「時程推薦」。</Alert>
      </div>
    </section>
  );
}
