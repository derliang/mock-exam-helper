import { useState } from 'preact/hooks';
import type { Classroom, LabelPaper } from '../../data';
import { seatLabel } from '../../data';
import { Button, ConfirmButton, Stepper } from './index';
import { confirmCopy } from '../flow';
import { classColorVars } from '../colors';
import { addRoom, clickSeat, isSeatActive, patchRoom, removeRoom, resize, roomCapacity, seatCap } from '../rooms';

/**
 * 教室清單與座位表編輯（步驟③與設定頁共用，D69②）：每間一列，點該列或「編輯座位表」就在列下展開，可收合。
 * 座位只能多不能少；點哪個座位，哪個就不排（可任意指定）；座位上限依標籤紙（D74）。
 */
export function RoomList(p: {
  rooms: Classroom[]; paper: LabelPaper; onChange: (r: Classroom[]) => void;
  /** 步驟③：勾選本次使用的教室；設定頁不傳 */
  selected?: string[]; onSelect?: (ids: string[]) => void;
  /** 這間教室是否已被某次模擬考選用（刪除確認時提醒） */
  inUse?: (id: string) => boolean;
  /** 班級資料：教室名稱與班級名稱相同時，前面的圓圈用該班的縮寫與代表色 */
  classes?: { name: string; colorIndex: number }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cap = seatCap(p.paper);
  const upd = (id: string, f: (r: Classroom) => Classroom) => p.onChange(patchRoom(p.rooms, id, f));
  return (
    <div class="rw">
      <p class="muted small">點教室那一列，或按「▸ 編輯座位表」，就會在下方展開座位配置。</p>
      {p.rooms.map((r) => {
        const isOpen = open === r.id;
        const on = p.selected?.includes(r.id) ?? false;
        return (
          <div key={r.id} class="rw">
            <div class={`roomrow${on ? ' on' : ''}`} onClick={() => setOpen(isOpen ? null : r.id)}>
              {p.selected && p.onSelect ? (
                <input type="checkbox" aria-label={`使用${r.name}`} checked={on} onClick={(e) => e.stopPropagation()}
                  onChange={(e) => p.onSelect!(e.currentTarget.checked ? [...p.selected!, r.id] : p.selected!.filter((x) => x !== r.id))} />
              ) : <RoomBadge room={r} index={p.rooms.indexOf(r)} classes={p.classes} />}
              <div class="field"><label class="small" for={`rn-${r.id}`}>{r.kind === 'class' ? '班級教室' : '預備教室'}</label>
                <input id={`rn-${r.id}`} class="input" value={r.name} onClick={(e) => e.stopPropagation()} onChange={(e) => upd(r.id, (x) => ({ ...x, name: e.currentTarget.value.trim() || x.name }))} /></div>
              <div class="field" onClick={(e) => e.stopPropagation()}><span class="label">橫排（左右）</span><Stepper label="橫排" value={r.rows} max={cap} onChange={(n) => upd(r.id, (x) => resize(x, { rows: n }, cap))} /></div>
              <div class="field" onClick={(e) => e.stopPropagation()}><span class="label">深位（前後）</span><Stepper label="深位" value={r.depth} max={cap} onChange={(n) => upd(r.id, (x) => resize(x, { depth: n }, cap))} /></div>
              <div class="info">座位 {r.seatCount}／{roomCapacity(r)}（上限 {cap}）</div>
              <div class="btnrow" onClick={(e) => e.stopPropagation()}>
                <Button small onClick={() => setOpen(isOpen ? null : r.id)}>{isOpen ? '▾ 收合座位表' : '▸ 編輯座位表'}</Button>
                <ConfirmButton small copy={confirmCopy.deleteRoom(r.name, !!p.selected?.includes(r.id) || !!p.inUse?.(r.id))} onConfirm={() => p.onChange(removeRoom(p.rooms, r.id))}>刪除</ConfirmButton>
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

/** 教室列前的圓圈：名稱與某班相同＝該班縮寫＋代表色；其他班級教室＝編號；預備教室＝「備」（不再寫莫名的「班」） */
function RoomBadge(p: { room: Classroom; index: number; classes?: { name: string; colorIndex: number }[] }) {
  const cls = p.room.kind === 'class' ? p.classes?.find((c) => c.name === p.room.name) : undefined;
  if (cls) return <span class="no" aria-hidden="true" style={classColorVars(cls.colorIndex)}>{[...cls.name][0]}</span>;
  return <span class="no" aria-hidden="true">{p.room.kind === 'class' ? p.index + 1 : '備'}</span>;
}

/** 座位表：講臺在下，深位 1 最靠講臺（左側只標數字），橫排標「第N排」，每格印「排-深位」（D49/D50） */
function SeatGrid(p: { room: Classroom; cap: number; onChange: (r: Classroom) => void }) {
  const { room } = p;
  const depths = Array.from({ length: room.depth }, (_, i) => room.depth - i); // 上到下：深位大→小
  const rows = Array.from({ length: room.rows }, (_, i) => i + 1);
  return (
    <div class="roomedit prev">
      <h4>{room.name} 座位表</h4>
      <p class="muted small">點哪個座位，哪個就「不排」（打斜線，例如壞掉的桌椅或走道）；再點一次恢復。排座時會跳過不排的座位，人由前往後連續坐。</p>
      <div style="overflow-x:auto">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center">
          <div />
          <div class="pgrid" style={{ gridTemplateColumns: `repeat(${room.rows}, max-content)` }} role="grid" aria-label={`${room.name}座位表`}>
            {depths.flatMap((d) => rows.map((rw) => {
              const pos = { row: rw, depth: d };
              const act = isSeatActive(room, pos);
              return (
                <button type="button" key={`${rw}-${d}`} class={`pc${act ? '' : ' off'}`} aria-pressed={act} title={act ? '點一下：這個座位不排' : '點一下：恢復這個座位'}
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
