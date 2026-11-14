import { useState } from 'preact/hooks';
import type { ExamConfig } from '../../data';
import { dayName, examSubjectPeriods, slotName } from '../../core/periods';
import { Alert, Badge, Button, EmptyState, PageHead, StatsBar } from '../components';
import { SeatChart } from '../components/SeatChart';
import { detachChartModel, examClasses, examResult, examRooms, nameMapOf, type StepNo } from '../seating';
import type { Doc } from '../store';

/** 每節（科目）一頁的計算：抽離考試、抽離自習、預備教室容量、使用教室（稿 H-9） */
export interface ReserveSlot {
  subjectId: string; name: string; when: string;
  exam: { roomId: string; codes: string[] }[]; study: { roomId: string; codes: string[] }[];
  examN: number; studyN: number; capacity: number; rooms: number; short: number;
}

export function reserveSlots(doc: Doc, exam: ExamConfig): ReserveSlot[] {
  const result = examResult(doc, exam);
  if (!result) return [];
  const rooms = examRooms(doc, exam);
  const capacity = rooms.filter((r) => r.kind === 'reserve').reduce((n, r) => n + r.seatCount, 0);
  const periods = examSubjectPeriods(exam, doc.settings);
  return exam.subjects.map((s) => {
    const group = (purpose: 'exam' | 'study') => {
      const m = new Map<string, string[]>();
      for (const d of result.detaches.filter((x) => x.subjectId === s.id && x.purpose === purpose)) m.set(d.roomId, [...(m.get(d.roomId) ?? []), d.code]);
      return [...m].map(([roomId, codes]) => ({ roomId, codes }));
    };
    const ex = group('exam'); const st = group('study');
    const examN = ex.reduce((n, g) => n + g.codes.length, 0); const studyN = st.reduce((n, g) => n + g.codes.length, 0);
    const first = periods.get(s.id)?.[0];
    const when = first?.slot ? `${dayName(first.day ?? 0)} ${slotName(first.slot)}` : '';
    return { subjectId: s.id, name: s.name, when, exam: ex, study: st, examN, studyN, capacity, rooms: new Set([...ex, ...st].map((g) => g.roomId)).size, short: Math.max(0, examN + studyN - capacity) };
  });
}

/** 預備教室與抽離子頁（稿 H-9 ＝ 原型 vPrep）：每節分頁、容量四格、抽離考試座位表、抽離自習名單 */
export function ReservePage(p: { doc: Doc; examId: string; crumbs: { label: string; onClick: () => void }[]; onGoStep: (n: StepNo) => void; onExams: () => void }) {
  const exam = p.doc.exams.find((e) => e.id === p.examId);
  const [sel, setSel] = useState('');
  if (!exam) {
    return <section><PageHead crumbs={p.crumbs} title="預備教室與抽離" /><EmptyState title="找不到這個模擬考" action={<Button kind="primary" onClick={p.onExams}>回模擬考列表</Button>}>它可能已被刪除，或資料夾換了。</EmptyState></section>;
  }
  const head = <PageHead crumbs={p.crumbs} title="預備教室與抽離" badge={exam.name} />;
  if (exam.division === 'junior') {
    return <section>{head}<div class="card stack"><Alert tone="info">會考不需要抽離，沒有預備教室。</Alert></div></section>;
  }
  const result = examResult(p.doc, exam);
  const slots = reserveSlots(p.doc, exam);
  if (!result || slots.length === 0) {
    return <section>{head}<div class="card stack"><Alert tone="info">還沒有排座，所以沒有抽離資料。請先到 ⑤ 排座。<Button small onClick={() => p.onGoStep(5)}>回 ⑤ 排座</Button></Alert></div></section>;
  }
  const rooms = examRooms(p.doc, exam);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
  const names = nameMapOf(p.doc, exam);
  const classes = new Map(examClasses(p.doc, exam).map((c) => [c.no, c.name]));
  const active = slots.find((s) => s.subjectId === sel) ?? slots.find((s) => s.examN + s.studyN > 0) ?? slots[0]!;
  const n = (s: ReserveSlot) => s.examN + s.studyN;
  const title = (sub: string) => `【${exam.name}】${sub} 抽離考試`;
  return (
    <section class="stack">
      {head}
      <p class="muted">每一節科目各自計算；不同節可重用預備教室，同一節的考試抽離與自習抽離用不同教室。</p>
      <div class="seg" role="group" aria-label="節次科目" style="max-width:100%;overflow-x:auto">
        {slots.map((s) => (
          <button type="button" key={s.subjectId} aria-pressed={s.subjectId === active.subjectId} onClick={() => setSel(s.subjectId)}>
            {s.when ? `${s.when} ` : ''}{s.name}{n(s) ? `（${n(s)}）` : ''}
          </button>
        ))}
      </div>
      <StatsBar items={[
        { label: '抽離考試', value: `${active.examN} 人` },
        { label: '抽離自習', value: `${active.studyN} 人` },
        { label: '預備教室容量', value: active.capacity },
        { label: '使用教室', value: `${active.rooms} 間` },
      ]} />
      {active.short > 0 && (
        <Alert tone="warn" action={<Button small onClick={() => p.onGoStep(3)}>到 ③ 教室設定</Button>}><b>預備教室座位不足：</b>這一節還缺 {active.short} 個座位，請到 ③ 增加預備教室。</Alert>
      )}
      <div class="card stack">
        <div class="row" style="justify-content:space-between">
          <div><h3>抽離考試（＋）：{active.examN} 人</h3><p class="small muted">用同一套排座引擎排進預備教室，產出座位表與標籤。</p></div>
          {active.examN > 0 && <Badge tone="info">出座位表與標籤</Badge>}
        </div>
        {active.examN === 0
          ? <p class="small muted">這一節沒有人要抽離考試。</p>
          : active.exam.map((g) => {
            const room = rooms.find((r) => r.id === g.roomId);
            const m = room ? detachChartModel(p.doc, exam, result, room, active.subjectId) : null;
            return room && m ? <SeatChart key={g.roomId} model={m} title={title(active.name)} sub={`${room.name}　考生 ${m.count} 人`} pull /> : null;
          })}
      </div>
      <div class="card stack">
        <div class="row" style="justify-content:space-between">
          <div><h3>抽離自習（X）：{active.studyN} 人</h3><p class="small muted">自習名單依預備教室順序，每間再依班級、座號排；與考試抽離用不同教室。</p></div>
          {active.studyN > 0 && <Badge>只出名單與人數</Badge>}
        </div>
        {active.studyN === 0
          ? <p class="small muted">這一節沒有人要抽離自習。</p>
          : active.study.map((g) => (
            <div key={g.roomId} class="stack" style="gap:6px">
              <div class="lab">{roomName(g.roomId)}　{g.codes.length} 人</div>
              <div class="scroll" style="max-height:220px;overflow-y:auto">
                <table class="t compact">
                  <thead><tr><th>序</th><th>考生編號</th><th>班級</th><th>姓名</th></tr></thead>
                  <tbody>{[...g.codes].sort().map((c, i) => <tr key={c}><td class="n">{i + 1}</td><td class="n">{c}</td><td>{classes.get(Number(c.slice(0, 2))) ?? ''}</td><td>{names.get(c) ?? ''}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
      </div>
    </section>
  );
}
