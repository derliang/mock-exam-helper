import { useState } from 'preact/hooks';
import type { Classroom, ExamConfig } from '../../data';
import { classroomSeats, rowDepthOf } from '../../data';
import type { PlanRoom } from '../../core/astD99/contract';
import { Alert, Badge, Button, StepHead } from '../components';
import { AST_STEP_BLURBS } from '../nav';
import { normColor } from '../colors';
import { updateExam, type Doc } from '../store';
import { examEntries } from '../seating';
import { PhaseCard, PhaseGuard } from './AstRelease';
import { LockCard, seatLockOf, toggleSeatLock } from './AstLocks';
import { astModeOf, astPlan, awayStudy, astSlots, MODE_LABEL, slotRoster, usageCell, withApproval, withoutApproval, type AstPlan, type AstSlot } from './model';

const KIND_TEXT: Record<string, string> = { exam: '考', study: '自習', borrow: '借用自習', pending: '待核可', home: '原班', none: '—' };

/** 考場座位圖（深位 1 靠講臺在下，排由左到右）；格子沿用班級色，停用／沒有的座位畫斜線 */
function RoomChart(p: { doc: Doc; plan: AstPlan; slot: AstSlot; roomId: string; roomName: string; room: Classroom | undefined; only: number; lockMode?: boolean; locked?: ReadonlySet<string>; onSeat?: (code: string, row: number, depth: number) => void }) {
  const { room } = p;
  const cols = room ? room.rows : 0;
  if (!room || cols === 0) return <p class="small muted">找不到這間教室的座位資料。</p>;
  const placed = new Map<string, { code: string; subjectId: string }>();
  for (const e of p.plan.out.exams) if (e.slotId === p.slot.id && e.roomId === p.roomId) placed.set(`${e.row}-${e.depth}`, e);
  const usable = new Set(classroomSeats(room).map((s) => `${s.row}-${s.depth}`));
  const mx = Math.max(...Array.from({ length: cols }, (_, i) => rowDepthOf(room, i + 1)));
  const student = new Map(p.plan.input.students.map((s) => [`${String(s.classNo).padStart(2, '0')}${String(s.seatNo).padStart(2, '0')}`, s]));
  const classes = new Map(p.doc.settings.classes.filter((c) => c.division === 'senior').map((c) => [c.no, c]));
  const mixed = new Set(p.plan.out.mixedRows.filter((m) => m.slotId === p.slot.id && m.roomId === p.roomId).map((m) => m.row));
  const cells: preact.JSX.Element[] = [];
  for (let d = mx; d >= 1; d--) {
    for (let c = 1; c <= cols; c++) {
      const key = `${c}-${d}`;
      if (d > rowDepthOf(room, c)) { cells.push(<div key={key} class="cell empty-seat" aria-label={`${key} 沒有這個座位`} />); continue; }
      if (!usable.has(key)) { cells.push(<div key={key} class="cell empty-seat" aria-label={`${key} 停用座位`} />); continue; }
      const e = placed.get(key);
      if (!e) { cells.push(<div key={key} class="cell empty-seat" aria-label={`${key} 空位`}><span class="co">{key}</span></div>); continue; }
      const s = student.get(e.code);
      const cls = classes.get(Number(e.code.slice(0, 2)));
      const dim = p.only > 0 && Number(e.code.slice(0, 2)) !== p.only;
      const lk = p.locked?.has(e.code) ?? false;
      const act = p.lockMode && p.onSeat ? { role: 'button' as const, tabIndex: 0, onClick: () => p.onSeat!(e.code, c, d), onKeyDown: (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); p.onSeat!(e.code, c, d); } } } : {};
      cells.push(
        <div key={key} class={`cell${dim ? ' dim' : ''}${lk ? ' locked' : ''}${p.lockMode ? ' lockable' : ''}`} data-c={cls ? normColor(cls.colorIndex) : 1}
          aria-label={`${e.code} ${cls?.name ?? ''} ${s?.name ?? ''}，座位 ${key}${p.lockMode ? (lk ? '，已鎖定，點一下解除' : '，點一下鎖定') : lk ? '，已鎖定' : ''}`} {...(p.lockMode ? { 'aria-pressed': lk } : {})} {...act}>
          <span class="co">{key}</span><span class="no">{e.code}</span>
          <span class="meta"><span class="tg">{cls?.name ?? ''}</span>{s?.name ?? ''}</span>
          {lk && <span class="lkm">鎖</span>}
        </div>,
      );
    }
  }
  return (
    <div class="chartbox">
      <div class="chart"><div class="chart-wrap">
        <div class="chart-title">{p.slot.label}　{p.slot.subjectLabel}<small>{p.roomName}　考生 {placed.size} 人{mixed.size ? `・同排混科 ${mixed.size} 排` : ''}</small></div>
        <div class="axis-y" style={{ gridTemplateRows: `repeat(${mx},var(--ch))` }} aria-hidden="true">{Array.from({ length: mx }, (_, i) => <span key={i}>{mx - i}</span>)}</div>
        <div>
          <div class="cg" style={{ gridTemplateColumns: `repeat(${cols},var(--cw))` }}>{cells}</div>
          <div class="axis-x" style={{ gridTemplateColumns: `repeat(${cols},var(--cw))`, marginTop: '4px' }} aria-hidden="true">{Array.from({ length: cols }, (_, i) => <span key={i}>第{i + 1}排</span>)}</div>
        </div>
        <div class="podium-bar">講　台</div>
      </div></div>
    </div>
  );
}

/** ⑤ 時段教室與座位（分科，DESIGN 10.14、稿 v2.34）：教室用途表、替代方案提示卡、該時段名單、考場座位圖、硬性限制檢查 */
export function AstStep5(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep: (n: 2 | 3 | 4) => void }) {
  const { doc, exam } = p;
  const mode = astModeOf(exam);
  const slots = astSlots(doc, exam);
  const plan = astPlan(doc, exam);
  const [sel, setSel] = useState<{ slot: number; room?: string }>({ slot: 0 });
  const [only, setOnly] = useState(0);
  const [lockMode, setLockMode] = useState(false);

  if (examEntries(doc, exam).length === 0) {
    return (
      <section class="stack"><StepHead title="⑤ 時段教室與座位" blurb={AST_STEP_BLURBS[4]} />
        <Alert tone="info" action={<Button onClick={() => p.onStep(2)}>前往 ② 考試名單</Button>}><b>還沒有考試名單。</b>教室用途與座位要依考試名單排，請先到 ② 匯入考生名單。</Alert></section>
    );
  }
  if (!plan) {
    return (
      <section class="stack"><StepHead title="⑤ 時段教室與座位" blurb={AST_STEP_BLURBS[4]} />
        <Alert tone="info" action={<Button onClick={() => p.onStep(3)}>前往 ③ 教室與自習空間</Button>}><b>還沒有勾選可用的教室。</b>請先到 ③ 勾選班級教室與綜合教室。</Alert></section>
    );
  }

  if (plan.infeasible) {
    return (
      <section class="stack"><StepHead title="⑤ 時段教室與座位" blurb={AST_STEP_BLURBS[4]} />
        <Alert tone="danger" action={<Button onClick={() => p.onStep(3)}>前往 ③ 教室與自習空間</Button>}><b>座位不夠，排不出方案。</b>有時段的考生比本次勾選的考場座位多。請到 ③ 勾選更多教室或增加座位，補足後這裡才會出現教室用途與座位圖。</Alert></section>
    );
  }
  const roomData = new Map(doc.settings.classrooms.map((c) => [c.id, c]));
  const roomName = (id: string) => roomData.get(id)?.name ?? id;
  const planRooms = plan.input.rooms;
  const used = (r: PlanRoom) => r.kind === 'class' || slots.some((s) => usageCell(plan, s, r).kind !== 'none');
  const rooms = planRooms.filter(used);
  const slot = slots[Math.min(sel.slot, slots.length - 1)]!;
  const examRoomIds = planRooms.filter((r) => plan.out.usage[slot.id]?.[r.id] === 'exam').map((r) => r.id);
  const roomId = sel.room && examRoomIds.includes(sel.room) ? sel.room : examRoomIds[0];
  const roster = slotRoster(plan, slot.id);
  const classes = new Map(doc.settings.classes.filter((c) => c.division === 'senior').map((c) => [c.no, c.name]));
  const fromText = (m: Map<number, number>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${classes.get(c) ?? c} ${n}`).join('、');
  const examTotal = plan.out.exams.filter((e) => e.slotId === slot.id).length;
  const studyTotal = awayStudy(plan, slot.id).length + (plan.out.unplaced?.filter((u) => u.slotId === slot.id).length ?? 0);
  const patchApprovals = (a: { slotId: string; roomId: string }[]) => { const r = updateExam(doc, exam.id, { astApprovals: a }); if (r.ok) p.onChange(r.doc); };
  const slotOf = (id: string) => slots.find((s) => s.id === id);
  const lockedUse = new Set((exam.astLocks?.rooms ?? []).map((l) => `${l.slotId}|${l.roomId}`));

  // 硬性限制檢查（DESIGN 10.14）：由方案輸出直接數，不通過就不輸出看似成功的結果
  let seatOver = 0; let capOver = 0; let both = 0;
  for (const s of slots) {
    for (const r of planRooms) {
      const ex = plan.out.exams.filter((e) => e.slotId === s.id && e.roomId === r.id).length;
      const st = plan.out.study.filter((e) => e.slotId === s.id && e.roomId === r.id).length;
      if (ex > r.seats.length) seatOver++;
      if (st > r.studyCapacity) capOver++;
      if (ex > 0 && st > 0) both++;
    }
  }
  const unplaced = plan.unplaced;
  const check = (ok: boolean, title: string, detail: string) => (
    <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:6px" key={title}>
      <span><Badge tone={ok ? 'ok' : 'danger'}>{ok ? '通過' : '不通過'}</Badge>　{title}</span><span class="small muted">{detail}</span>
    </div>
  );

  return (
    <section class="stack">
      <StepHead title="⑤ 時段教室與座位" blurb={AST_STEP_BLURBS[4]} />
      <PhaseCard doc={doc} exam={exam} onChange={p.onChange} />
      <PhaseGuard exam={exam}>

      <div class="card stack">
        <div><h3>各時段教室用途</h3><p class="small muted">每一格是一間教室在那個時段的用途。點一格看那個時段的考場與座位圖；點上面的時段看整個時段。</p></div>
        <div class="row" style="justify-content:space-between">
          <div class="small muted">目前模式：<b>{MODE_LABEL[mode]}</b>・用 {plan.out.metrics?.roomsTotal ?? 0} 間教室・離開原班 {plan.out.metrics?.leaveHome ?? 0} 人次</div>
          <Button small onClick={() => p.onStep(4)}>到 ④ 換模式</Button>
        </div>
        <div class="scroll">
          <table class="ut">
            <thead>
              <tr><th class="rn" rowSpan={2}>教室</th>{[...new Set(slots.map((s) => s.day))].map((d) => <th class="day" key={d} colSpan={slots.filter((s) => s.day === d).length}>{slots.find((s) => s.day === d)!.label.split(' ')[0]}</th>)}</tr>
              <tr>{slots.map((s, i) => (
                <th key={s.id}><button type="button" class="thb" aria-pressed={sel.slot === i} onClick={() => setSel({ slot: i })}>{s.label.split(' ')[1] ?? s.label}<br />{s.subjectLabel}</button></th>
              ))}</tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td class="rn"><b>{roomName(r.id)}</b><br /><span class="small muted">{r.kind === 'class' ? (r.track === 'science' ? '理組教室' : r.track === 'liberal' ? '文組教室' : '班級教室') : '綜合教室'}・{r.seats.length} 位</span></td>
                  {slots.map((s, i) => {
                    const c = usageCell(plan, s, r);
                    const cls = c.kind === 'exam' ? 'u-ex' : c.kind === 'study' ? 'u-st' : c.kind === 'borrow' ? 'u-bor' : c.kind === 'pending' ? 'u-pend' : c.kind === 'home' ? 'u-home' : '';
                    return (
                      <td class={cls} key={s.id}>
                        <button type="button" aria-pressed={sel.slot === i && roomId === r.id} {...(lockedUse.has(`${s.id}|${r.id}`) ? { 'data-lock': '1' } : {})} aria-label={`${roomName(r.id)}，${s.label} ${s.subjectLabel}：${KIND_TEXT[c.kind]}${c.count ? ` ${c.count} 人` : ''}${lockedUse.has(`${s.id}|${r.id}`) ? '，已鎖定' : ''}`}
                          onClick={() => setSel({ slot: i, ...(c.kind === 'exam' ? { room: r.id } : {}) })}>
                          <span>{c.kind === 'exam' ? `考 ${c.subjectLabel}` : KIND_TEXT[c.kind]}</span>{c.count > 0 && <b>{c.kind === 'pending' ? `+${c.count}` : c.count}</b>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="row ulg">
          <span class="lg"><i class="u-ex" />考試（科目＋人數）</span><span class="lg"><i class="u-st" />自習（綜合教室）</span><span class="lg"><i class="u-bor" />借用原班自習（已核可）</span>
          <span class="lg"><i class="u-pend" />待核可</span><span class="lg"><i class="u-home" />原班（沒被徵用，同學留在原班自習）</span>
        </div>

        {plan.pending.map((pr) => {
          const s = slotOf(pr.slotId);
          return (
            <div class="alert a-warn propcard" key={`${pr.slotId}|${pr.roomId}`}>
              <span aria-hidden="true">⚠</span>
              <span>
                <b>{s?.label}（{s?.subjectLabel}）自習容量不足。</b><br />
                目前可用的綜合教室自習容量不夠。<b>程式建議：改用「{roomName(pr.roomId)}」</b>（這個時段沒當考場），可安置 {pr.count ?? 0} 位抽離自習。
                <br /><span class="small"><b>影響：</b>教室總數{pr.addsRoom ? ' +1（這間是新增使用的教室）' : '不變（這間其他時段已經用過）'}；這 {pr.count ?? 0} 位同學要離開原班；只影響這個時段。<b>未經你核可不會採用。</b></span>
              </span>
              <span class="acts">
                <Button kind="primary" small onClick={() => patchApprovals(withApproval(exam, pr.slotId, pr.roomId))}>核可此方案</Button>
                <Button small onClick={() => p.onStep(3)}>調高自習容量／改設定</Button>
              </span>
            </div>
          );
        })}
        {plan.approved.map((pr) => {
          const s = slotOf(pr.slotId);
          return (
            <Alert tone="ok" key={`${pr.slotId}|${pr.roomId}`}>
              {s?.label}（{s?.subjectLabel}）已核可替代方案，自習借用「{roomName(pr.roomId)}」。{' '}
              <Button small kind="ghost" onClick={() => patchApprovals(withoutApproval(exam, pr.slotId, pr.roomId))}>取消核可</Button>
            </Alert>
          );
        })}
        {unplaced > 0 && plan.pending.length === 0 && (
          <Alert tone="danger" action={<Button small onClick={() => p.onStep(3)}>前往 ③ 調整</Button>}>
            <b>有 {unplaced} 人排不進自習空間，也沒有可用的替代教室。</b>請到 ③ 調高自習容量、勾選更多綜合教室，或開啟「允許自習去他班原班教室」。
          </Alert>
        )}
      </div>

      <div class="card stack">
        <div><h3>{slot.label}（{slot.subjectLabel}）</h3><p class="small muted">這個時段誰在哪間教室。</p></div>
        <div class="stats">
          <div><small>時段</small><strong>{slot.label}</strong></div><div><small>科目</small><strong>{slot.subjectLabel}</strong></div>
          <div><small>應考</small><strong>{examTotal} 人</strong></div><div><small>考場</small><strong>{roster.exam.size} 間</strong></div>
          <div class={studyTotal > 0 && plan.pending.some((x) => x.slotId === slot.id) ? 'bad' : ''}><small>自習（離開原班）</small><strong>{studyTotal} 人</strong></div>
        </div>
        <div class="scroll">
          <table class="t compact">
            <thead><tr><th>用途</th><th>教室</th><th>人數</th><th>來自</th></tr></thead>
            <tbody>
              {[...roster.exam.entries()].map(([id, m]) => <tr key={`e${id}`}><td><Badge tone="info">考試</Badge></td><td><b>{roomName(id)}</b></td><td class="n">{[...m.values()].reduce((a, b) => a + b, 0)}</td><td>{fromText(m)}</td></tr>)}
              {[...roster.study.entries()].map(([id, m]) => <tr key={`s${id}`}><td><Badge>{roomData.get(id)?.kind === 'class' ? '借用自習' : '自習'}</Badge></td><td><b>{roomName(id)}</b></td><td class="n">{[...m.values()].reduce((a, b) => a + b, 0)}</td><td>{fromText(m)}</td></tr>)}
              {plan.pending.filter((x) => x.slotId === slot.id).map((x) => <tr key={`p${x.roomId}`}><td><Badge tone="warn">待核可</Badge></td><td>—</td><td class="n">{x.count ?? 0}</td><td>待核可後安置</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card stack">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap">
          <div><h3>考場座位圖</h3><p class="small muted">每排深位數可以不同；斜線格＝停用或沒有這個座位。</p></div>
          <div class="seg" role="group" aria-label="這個時段的考場">
            {examRoomIds.map((id) => <button type="button" key={id} aria-pressed={id === roomId} onClick={() => setSel({ slot: sel.slot, room: id })}>{roomName(id)}</button>)}
          </div>
        </div>
        {roomId && (
          <>
            <div class="seg" role="group" aria-label="檢視班級">
              <button type="button" aria-pressed={only === 0} onClick={() => setOnly(0)}>全部班級</button>
              {[...new Set(plan.out.exams.filter((e) => e.slotId === slot.id && e.roomId === roomId).map((e) => Number(e.code.slice(0, 2))))].sort((a, b) => a - b).map((c) => (
                <button type="button" key={c} aria-pressed={only === c} onClick={() => setOnly(c)}>只看{classes.get(c) ?? c}</button>
              ))}
            </div>
            <RoomChart doc={doc} plan={plan} slot={slot} roomId={roomId} roomName={roomName(roomId)} room={roomData.get(roomId)} only={only} lockMode={lockMode} locked={seatLockOf(exam, slot.id, roomId)}
              onSeat={(code, row, depth) => { const r = updateExam(doc, exam.id, { astLocks: toggleSeatLock(exam, { slotId: slot.id, code, roomId, row, depth }) }); if (r.ok) p.onChange(r.doc); }} />
          </>
        )}
        {!roomId && <p class="small muted">這個時段沒有考場。</p>}
        <div class="small muted"><b>教室內怎麼排（第二階段，順序固定、不權衡）：</b>①同班依座號由小到大，同一排只放同一班、各班各自連續；②不同科盡量分排，同排混科只准「連續分區」、不准逐位交錯；③跨科盡量同座位，但輸給①（發卷核對與座號依序優先）。</div>
        {plan.out.mixedRows.length > 0 && <Alert tone="warn"><b>有 {plan.out.mixedRows.length} 排同排混科。</b>同排混科只准連續分區，發卷時請一科一區。</Alert>}
      </div>

      <div class="card stack">
        <div><h3>硬性限制檢查</h3><p class="small muted">不符合就不輸出看似成功的結果。</p></div>
        {check(both === 0, '同一時段同一間教室只能是考場或自習其中一種', `${both} 處`)}
        {check(seatOver === 0, '考場人數不超過可排座位', `${seatOver} 處`)}
        {check(capOver === 0, '自習人數不超過自習容量', `${capOver} 處`)}
        {check(unplaced === 0, '每位考生每個時段都有明確位置（考場、自習或原班）', `${unplaced} 人沒位置`)}
        {check(plan.pending.length === 0, '沒有尚待核可的替代方案', `${plan.pending.length} 項待核可`)}
        {check(plan.errors.length === 0, '全量規則驗證（座號依序、同排同班、文理組、混科分區…）', plan.errors.length ? `${plan.errors.length} 項不通過` : '全部通過')}
        {plan.errors.length > 0 && <ul class="small errnote">{plan.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}{plan.errors.length > 8 && <li>…另有 {plan.errors.length - 8} 項</li>}</ul>}
      </div>

      <LockCard doc={doc} exam={exam} plan={plan} slot={slot} roomId={roomId} roomName={roomName} classes={classes} lockMode={lockMode} onLockMode={setLockMode} onChange={p.onChange} frozen={exam.astPhase !== undefined && exam.astPhase !== 'planning'} />
      </PhaseGuard>
    </section>
  );
}
