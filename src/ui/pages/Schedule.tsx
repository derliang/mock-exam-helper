/**
 * 共用設定第六個分頁「節次與時長」（稿 v2.22，校-55；D92、D94）：
 * 像學校的模擬考科目表，一天一欄、科目由上往下；可拖拉或按 ↑↓ 改順序（也可移到另一天）；
 * 節次編號依順序自動算，勾「與上一科同節」才同節；開始時間選填、不印在標籤上；可新增、刪除、還原預設。
 */
import { useState } from 'preact/hooks';
import type { PeriodTable, ScheduleKey } from '../../data';
import { addRow, dropRow, isDefaultSchedule, moveRow, numberRows, removeRow, SCHEDULE_KEYS, scheduleOf, updateRow, withSchedule, type RowRef } from '../../core/periods';
import type { Doc } from '../store';

const NOTES: Record<ScheduleKey, string> = {
  g12: '順序依學校科目表（與大考日程圖不同）；英聽一定排在第一天最後一節。國文「整個一起標」：國綜、國寫是兩節，但標示與抽離當成一個。',
  g34: '沒有英聽，英聽的位置換成數學 B。國文「整個一起標」：國綜、國寫是兩節，但標示與抽離當成一個。',
  ast: '兩天各 4 節、共 8 節，順序與正式考試相同，每節 80 分鐘。學校偶爾把兩天壓成一天、文理組同節考不同科（例如 114 下學期第 6 次），那是特例：勾「與上一科同節」即可。',
  bcct: '順序與時長同正式會考。會考不需要抽離，節次與時長只用在標籤與日程顯示。',
};
const DAY = ['一', '二', '三', '四'];

export function ScheduleTab({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  const [key, setKey] = useState<ScheduleKey>('g12');
  const [drag, setDrag] = useState<RowRef | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const table = scheduleOf(doc.settings, key);
  const label = SCHEDULE_KEYS.find((x) => x.key === key)!.label;
  const save = (t: PeriodTable) => onChange({ ...doc, settings: withSchedule(doc.settings, key, t) });
  const rows = numberRows(table);
  const periodAt = (day: number, index: number) => rows.find((x) => x.day === day && x.index === index)!.period;
  const dropProps = (to: RowRef, id: string) => ({
    onDragOver: (e: DragEvent) => { if (drag) { e.preventDefault(); setOver(id); } },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: DragEvent) => { e.preventDefault(); if (drag) save(dropRow(table, drag, to)); setDrag(null); setOver(null); },
  });
  return (
    <div class="card stack">
      <div>
        <h3>節次與時長</h3>
        <p class="small muted">像學校的模擬考科目表：一天一欄，科目由上往下。<b>最重要的是科目順序</b>：用左邊的 ⠿ 拖拉，或按 ↑↓，也可以拖到另一天；新增模擬考時自動帶入這份順序。時長比照大考，只看考試時間、不管發卷與休息；開始時間每次可能不同，所以選填，也不會印在標籤上。</p>
      </div>
      <div class="row" style="justify-content:space-between">
        <div class="seg ttseg" role="group" aria-label="考試類型">
          {SCHEDULE_KEYS.map((x) => <button type="button" key={x.key} aria-pressed={key === x.key} onClick={() => setKey(x.key)}>{x.label}</button>)}
        </div>
        <button type="button" class="btn" disabled={isDefaultSchedule(table, key)} onClick={() => onChange({ ...doc, settings: withSchedule(doc.settings, key, undefined) })}>{`還原「${label}」預設`}</button>
      </div>
      <div class="alert a-info" role="status">
        <span aria-hidden="true">ℹ</span>
        <div><b>節次編號依順序自動算；同節＝同時進行。</b>{NOTES[key]}同一節各科的抽離人數會加總，再和預備教室容量比（預設一節一科，只有勾「與上一科同節」才會用到）。對應：1 月＝學測、7 月＝分科、5 月＝國中會考。</div>
      </div>
      <div class="tt">
        {table.days.map((day, di) => (
          <div class="ttc" key={di}>
            <div class="hd"><span>{`第 ${DAY[di] ?? di + 1} 天`}</span><span class="small muted">{`${day.length} 科`}</span></div>
            {day.map((r, i) => {
              const at = { day: di, index: i };
              const id = `${di},${i}`;
              const first = di === 0 && i === 0;
              const chinese = r.subjectId === 'chinese' && (key === 'g12' || key === 'g34');
              return (
                <div key={id} class={`ttr${r.samePrev && !first ? ' same' : ''}${drag && drag.day === di && drag.index === i ? ' dragging' : ''}${over === id ? ' over' : ''}`} {...dropProps(at, id)}>
                  <span class="sgrip" draggable title="拖拉改順序" aria-hidden="true"
                    onDragStart={(e) => { setDrag(at); e.dataTransfer?.setData('text/plain', id); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}>⠿</span>
                  <span class="sn">{`第 ${periodAt(di, i)} 節`}</span>
                  <input class="input" aria-label="科目名稱" value={r.name} onChange={(e) => { const v = e.currentTarget.value.trim(); if (v) save(updateRow(table, at, { name: v })); }} />
                  <span class="dur"><input class="input" type="number" min={1} aria-label="時長（分鐘）" value={r.minutes ?? ''} onChange={(e) => { const n = Math.round(Number(e.currentTarget.value)); save(updateRow(table, at, { minutes: n > 0 ? n : undefined })); }} /><span>分</span></span>
                  <span class="ops">
                    <button type="button" class="btn btn-sm btn-ghost" aria-label="上移" onClick={() => save(moveRow(table, at, -1))}>↑</button>
                    <button type="button" class="btn btn-sm btn-ghost" aria-label="下移" onClick={() => save(moveRow(table, at, 1))}>↓</button>
                    <button type="button" class="btn btn-sm btn-danger" aria-label={`刪除${r.name}`} onClick={() => save(removeRow(table, at))}>×</button>
                  </span>
                  <span class="sub">
                    <label><input type="checkbox" checked={!!r.samePrev && !first} disabled={first} onChange={(e) => save(updateRow(table, at, { samePrev: e.currentTarget.checked || undefined }))} />與上一科同節</label>
                    <label>開始時間（選填）<input class="input" type="time" value={r.start ?? ''} onChange={(e) => save(updateRow(table, at, { start: e.currentTarget.value || undefined }))} /></label>
                    {chinese && <span class="badge b-acc">國文：整個一起標</span>}
                    {r.subjectId === 'en-listen' && key === 'g12' && <span class="badge">英聽固定排第一天最後一節</span>}
                  </span>
                </div>
              );
            })}
            <div class={`end${over === `${di},end` ? ' over' : ''}`} {...dropProps({ day: di, index: day.length }, `${di},end`)}>
              <button type="button" class="btn btn-sm" onClick={() => save(addRow(table, di))}>＋ 新增一科</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
