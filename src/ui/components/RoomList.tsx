import { useState } from 'preact/hooks';
import type { Classroom, LabelPaper } from '../../data';
import { seatLabel } from '../../data';
import { Button, Stepper } from './index';
import { addRoom, clickSeat, isSeatActive, patchRoom, removeRoom, resize, roomCapacity, seatCap } from '../rooms';

/**
 * 教室清單與座位表編輯（步驟③與設定頁共用，D69②）：每間一列，點該列或「編輯座位表」就在列下展開，可收合。
 * 座位只能多不能少；點一個座位＝它和它之後都不排（D72）；座位上限依標籤紙（D74）。
 */
export function RoomList(p: {
  rooms: Classroom[]; paper: LabelPaper; onChange: (r: Classroom[]) => void;
  /** 步驟③：勾選本次使用的教室；設定頁不傳 */
  selected?: string[]; onSelect?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cap = seatCap(p.paper);
  const upd = (id: string, f: (r: Classroom) => Classroom) => p.onChange(patchRoom(p.rooms, id, f));
  return (
    <div class="rw">
      {p.rooms.map((r) => {
        const isOpen = open === r.id;
        const on = p.selected?.includes(r.id) ?? false;
        return (
          <div key={r.id} class="rw">
            <div class={`roomrow${on ? ' on' : ''}`} onClick={() => setOpen(isOpen ? null : r.id)}>
              {p.selected && p.onSelect ? (
                <input type="checkbox" aria-label={`使用${r.name}`} checked={on} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => p.onSelect!(e.currentTarget.checked ? [...p.selected!, r.id] : p.selected!.filter((x) => x !== r.id))} />
              ) : <span class="no" aria-hidden="true">{r.kind === 'class' ? '班' : '備'}</span>}
              <div class="field"><label class="small" for={`rn-${r.id}`}>{r.kind === 'class' ? '班級教室' : '預備教室'}</label>
                <input id={`rn-${r.id}`} class="input" value={r.name} onClick={(e) => e.stopPropagation()} onChange={(e) => upd(r.id, (x) => ({ ...x, name: e.currentTarget.value.trim() || x.name }))} /></div>
              <div onClick={(e) => e.stopPropagation()}><Stepper label="橫排" value={r.rows} max={cap} onChange={(n) => upd(r.id, (x) => resize(x, { rows: n }, cap))} /></div>
              <div onClick={(e) => e.stopPropagation()}><Stepper label="深位" value={r.depth} max={cap} onChange={(n) => upd(r.id, (x) => resize(x, { depth: n }, cap))} /></div>
              <div class="info">座位 {r.seatCount}／{roomCapacity(r)}（上限 {cap}）</div>
              <div class="btnrow" onClick={(e) => e.stopPropagation()}>
                <Button small onClick={() => setOpen(isOpen ? null : r.id)}>{isOpen ? '收合座位表' : '編輯座位表'}</Button>
                <Button small kind="danger" onClick={() => p.onChange(removeRoom(p.rooms, r.id))}>刪除</Button>
              </div>
            </div>
            {isOpen && <SeatGrid room={r} cap={cap} onChange={(x) => upd(r.id, () => x)} />}
          </div>
        );
      })}
      <div class="btnrow">
        <Button onClick={() => p.onChange(addRoom(p.rooms, 'class'))}>新增班級教室</Button>
        <Button onClick={() => p.onChange(addRoom(p.rooms, 'reserve'))}>新增預備教室</Button>
      </div>
    </div>
  );
}

/** 座位表：講臺在下，深位 1 最靠講臺（左側只標數字），橫排標「第N排」，每格印「排-深位」（D49/D50） */
function SeatGrid(p: { room: Classroom; cap: number; onChange: (r: Classroom) => void }) {
  const { room } = p;
  const depths = Array.from({ length: room.depth }, (_, i) => room.depth - i); // 上到下：深位大→小
  const rows = Array.from({ length: room.rows }, (_, i) => i + 1);
  return (
    <div class="roomedit prev">
      <h4>{room.name} 座位表</h4>
      <p class="muted small">點一個座位，它和它之後的座位都改成「不排」；再點「不排」的座位就恢復。空位只能在最後，不能在中間挖洞。</p>
      <div style="overflow-x:auto">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center">
          <div />
          <div class="pgrid" style={{ gridTemplateColumns: `repeat(${room.rows}, max-content)` }} role="grid" aria-label={`${room.name}座位表`}>
            {depths.flatMap((d) => rows.map((rw) => {
              const pos = { row: rw, depth: d };
              const act = isSeatActive(room, pos);
              return (
                <button type="button" key={`${rw}-${d}`} class={`pc${act ? '' : ' off'}`} aria-pressed={act}
                  aria-label={`${seatLabel(pos)} ${act ? '可用' : '不排'}`} onClick={() => p.onChange(clickSeat(room, pos, p.cap))}>{seatLabel(pos)}</button>
              );
            }))}
          </div>
        </div>
        <p class="muted small" style="margin-top:6px">↑ 後　深位 {room.depth}～1，由前（講臺）往後　｜　橫排：第 1～{room.rows} 排（左到右）</p>
        <p class="small" style="margin-top:4px;text-align:center"><b>▔▔ 講臺 ▔▔</b></p>
      </div>
    </div>
  );
}
