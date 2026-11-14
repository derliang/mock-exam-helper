/** ⑤ 最下面：鎖定（AST-3；DESIGN 10.19、H-09）。三種範圍：教室用途、班級考場、單一學生座位。衝突只回報，不自動解鎖。 */
import type { AstLocks, ExamConfig } from '../../data';
import { Alert, Badge, Button } from '../components';
import { updateExam, type Doc } from '../store';
import type { AstPlan, AstSlot } from './model';

type Seat = NonNullable<AstLocks['seats']>[number];

/** 這個時段這間教室裡，已鎖座位的學生代號 */
export const seatLockOf = (exam: ExamConfig, slotId: string, roomId: string): Set<string> =>
  new Set((exam.astLocks?.seats ?? []).filter((l) => l.slotId === slotId && l.roomId === roomId).map((l) => l.code));

const total = (l: AstLocks | undefined): number => (l?.seats?.length ?? 0) + (l?.classes?.length ?? 0) + (l?.rooms?.length ?? 0);

/** 點座位：沒鎖就把「現在坐在那裡的人」鎖在那個座位；已鎖就解除 */
export function toggleSeatLock(exam: ExamConfig, seat: Seat): AstLocks {
  const cur = exam.astLocks ?? {};
  const has = (cur.seats ?? []).some((l) => l.slotId === seat.slotId && l.code === seat.code);
  return { ...cur, seats: has ? (cur.seats ?? []).filter((l) => !(l.slotId === seat.slotId && l.code === seat.code)) : [...(cur.seats ?? []), seat] };
}

export function LockCard(p: {
  doc: Doc; exam: ExamConfig; plan: AstPlan; slot: AstSlot; roomId: string | undefined; roomName: (id: string) => string; classes: Map<number, string>;
  lockMode: boolean; onLockMode: (v: boolean) => void; onChange: (d: Doc) => void; frozen: boolean;
}) {
  const { exam, plan, slot, roomId } = p;
  const L = exam.astLocks ?? {};
  const save = (l: AstLocks): void => {
    const next: AstLocks = { ...l };
    for (const k of ['seats', 'classes', 'rooms'] as const) if (!next[k]?.length) delete next[k];
    const r = updateExam(p.doc, exam.id, { astLocks: Object.keys(next).length ? next : undefined });
    if (r.ok) p.onChange(r.doc);
  };
  const present = roomId ? [...new Set(plan.out.exams.filter((e) => e.slotId === slot.id && e.roomId === roomId).map((e) => Number(e.code.slice(0, 2))))].sort((a, b) => a - b) : [];
  const use = roomId ? plan.out.usage[slot.id]?.[roomId] : undefined;
  const useLocked = !!roomId && (L.rooms ?? []).some((r) => r.slotId === slot.id && r.roomId === roomId);
  const students = new Map(plan.input.students.map((s) => [`${String(s.classNo).padStart(2, '0')}${String(s.seatNo).padStart(2, '0')}`, s.name]));
  const slotText = (id: string): string => p.plan.input.slots.findIndex((x) => x.id === id) >= 0 ? (id === slot.id ? `${slot.label}（${slot.subjectLabel}）` : id) : id;
  const rows: { kind: string; slot: string; where: string; what: string; remove: () => void }[] = [
    ...(L.rooms ?? []).map((r, i) => ({ kind: '教室用途', slot: slotText(r.slotId), where: p.roomName(r.roomId), what: `這間教室這個時段維持「${r.use === 'exam' ? '考場' : '自習'}」，重排不改`, remove: () => save({ ...L, rooms: (L.rooms ?? []).filter((_, j) => j !== i) }) })),
    ...(L.classes ?? []).map((r, i) => ({ kind: '班級考場', slot: slotText(r.slotId), where: p.roomName(r.roomId), what: `${p.classes.get(r.classNo) ?? r.classNo}班在這間考場考試，重排不換間`, remove: () => save({ ...L, classes: (L.classes ?? []).filter((_, j) => j !== i) }) })),
    ...(L.seats ?? []).map((r, i) => ({ kind: '單一座位', slot: slotText(r.slotId), where: `${p.roomName(r.roomId)} ${r.row}-${r.depth}`, what: `${r.code} ${students.get(r.code) ?? ''} 固定坐這個座位`, remove: () => save({ ...L, seats: (L.seats ?? []).filter((_, j) => j !== i) }) })),
  ];
  const dis = p.frozen;
  return (
    <div class="card stack">
      <div><h3>鎖定</h3><p class="small muted">三種範圍：<b>教室用途</b>（某間教室某時段是考場或自習）、<b>班級考場</b>（某班考場安排）、<b>單一學生座位</b>。重排時鎖定的值<b>不會被改</b>；衝突時指出時段、教室、座位、學生、違反的規則與原因，<b>程式不會自己解除鎖定</b>。{dis ? '已定案，要改鎖定請先解除定案。' : ''}</p></div>
      {plan.conflicts.length > 0 && (
        <>
          <Alert tone="danger"><b>鎖定與規則衝突（{plan.conflicts.length} 項），衝突的鎖定沒有套用。</b><br />程式不會自己解除鎖定，也不會輸出看似成功的錯誤方案。請解除其中一項鎖定，或改鎖定；沒處理完不能確認定案。</Alert>
          <div class="scroll"><table class="t compact"><thead><tr><th>時段</th><th>教室</th><th>座位</th><th>學生</th><th>違反的規則</th><th>原因</th></tr></thead><tbody>
            {plan.conflicts.map((c, i) => (
              <tr key={i}><td>{slotText(c.slotId)}</td><td>{p.roomName(c.roomId)}</td><td>{c.seat ?? '—'}</td><td>{c.students.length ? c.students.slice(0, 6).map((x) => `${x} ${students.get(x) ?? ''}`).join('、') + (c.students.length > 6 ? `…共 ${c.students.length} 人` : '') : '—'}</td><td>{c.rule}</td><td>{c.reason}</td></tr>
            ))}
          </tbody></table></div>
        </>
      )}
      <div class="row" style="flex-wrap:wrap">
        <Button small disabled={dis || !roomId || useLocked || (use !== 'exam' && use !== 'study')} onClick={() => roomId && use && save({ ...L, rooms: [...(L.rooms ?? []), { slotId: slot.id, roomId, use }] })}>
          鎖定「{roomId ? p.roomName(roomId) : '—'}・{slot.label}」的用途{use ? `（${use === 'exam' ? '考場' : '自習'}）` : ''}
        </Button>
        {present.map((c) => {
          const has = (L.classes ?? []).some((x) => x.slotId === slot.id && x.classNo === c && x.roomId === roomId);
          return <Button small key={c} disabled={dis || has} onClick={() => roomId && save({ ...L, classes: [...(L.classes ?? []), { slotId: slot.id, classNo: c, roomId }] })}>鎖定「{p.classes.get(c) ?? c}班在這間考試」</Button>;
        })}
        <button type="button" class={`btn btn-sm${p.lockMode ? ' btn-primary' : ''}`} aria-pressed={p.lockMode} disabled={dis} onClick={() => p.onLockMode(!p.lockMode)}>{p.lockMode ? '結束鎖定座位（座位圖上點座位）' : '鎖定單一座位'}</button>
      </div>
      {p.lockMode && <Alert tone="info">鎖定座位模式：到上面的「考場座位圖」點有人的座位，就把那位學生固定在這個座位（再點一次解除）。</Alert>}
      {rows.length > 0
        ? <div class="scroll"><table class="t compact"><thead><tr><th>範圍</th><th>時段</th><th>教室／座位</th><th>內容</th><th></th></tr></thead><tbody>
            {rows.map((r, i) => <tr key={i}><td><Badge>{r.kind}</Badge></td><td>{r.slot}</td><td>{r.where}</td><td>{r.what}</td><td><Button small kind="ghost" disabled={dis} onClick={r.remove}>解除</Button></td></tr>)}
          </tbody></table></div>
        : <p class="small muted">目前沒有鎖定。</p>}
      {total(L) > 0 && <p class="small muted">鎖定算進方案的輸入：相同的名單、設定與鎖定，一定得到相同的結果。</p>}
    </div>
  );
}
