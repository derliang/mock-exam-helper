import { useState } from 'preact/hooks';
import type { ScheduleEntry } from '../../data';
import { defaultSchedule, SCHEDULE_LABEL, type ScheduleKey } from '../../core/period';
import { Alert, Badge, Button, Seg } from '../components';
import { AST_SUBJECTS, BCCT_SUBJECTS, defaultSubjects } from '../subjects';
import type { Doc } from '../store';

const KEYS: ScheduleKey[] = ['gsat12', 'gsat34', 'ast', 'bcct'];
const NOTE: Record<ScheduleKey, string> = {
  gsat12: '順序依學校科目表（與大考日程圖不同）；英聽固定排第一天最後一節。國文整個一起標：國綜、國寫當成一個科目。',
  gsat34: '沒有英聽，英聽的位置換成數學 B。國文整個一起標：國綜、國寫當成一個科目。',
  ast: '兩天各 4 節、共 8 節，每節 80 分鐘。學校偶爾把兩天壓成一天、文理組同節考不同科，那是特例：勾「與上一科同節」即可。',
  bcct: '順序與時長同正式會考。會考不需要抽離，節次只用在標籤與日程顯示。',
};
const NAMES = new Map<string, string>(
  [...BCCT_SUBJECTS, ...AST_SUBJECTS, ...defaultSubjects('gsat', 1), ...defaultSubjects('gsat', 3)].map((x) => [x.id, x.name] as const),
);
const nameOf = (id: string): string => NAMES.get(id) ?? id;

/** 這一類考試可新增的科目：只列內建科目表裡有的，避免學測表出現分科科目 */
function inKind(key: ScheduleKey, id: string): boolean {
  const list = key === 'bcct' ? BCCT_SUBJECTS : key === 'ast' ? AST_SUBJECTS : defaultSubjects('gsat', key === 'gsat12' ? 1 : 3);
  return list.some((s) => s.id === id);
}

/** 共用設定「節次與時長」分頁（校-55，稿 v2.18）：時間表式，一天一欄；改順序用 ↑↓，節次編號依順序自動算 */
export function SchedulePanel(p: { doc: Doc; onChange: (d: Doc) => void }) {
  const [key, setKey] = useState<ScheduleKey>('gsat12');
  const table: ScheduleEntry[] = p.doc.settings.schedules?.[key] ?? defaultSchedule(key);
  const save = (next: ScheduleEntry[]) => p.onChange({ ...p.doc, settings: { ...p.doc.settings, schedules: { ...p.doc.settings.schedules, [key]: next } } });
  const reset = () => {
    const { [key]: _gone, ...rest } = p.doc.settings.schedules ?? {};
    p.onChange({ ...p.doc, settings: { ...p.doc.settings, schedules: rest } });
  };
  const patch = (i: number, v: Partial<ScheduleEntry>) => save(table.map((r, j) => (j === i ? { ...r, ...v } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= table.length) return;
    const next = [...table];
    [next[i], next[j]] = [next[j]!, next[i]!];
    save(next);
  };
  const missing = [...NAMES.keys()].filter((id) => !table.some((r) => r.subjectId === id) && inKind(key, id));
  // 節次編號：依整張表的順序累計（不分天）
  const periodAt: number[] = [];
  let n = 0;
  table.forEach((r, i) => { if (!(r.same && i > 0)) n++; periodAt.push(n); });
  const day = (d: 1 | 2) => (
    <div class="ttc" key={d}>
      <div class="hd"><span>第 {d === 1 ? '一' : '二'} 天</span><span class="small muted">{table.filter((r) => r.day === d).length} 科</span></div>
      {table.map((r, i) => r.day !== d ? null : (
        <div class={`ttr${r.same ? ' same' : ''}`} key={r.subjectId}>
          <span class="sn">第 {periodAt[i]} 節</span>
          <b>{nameOf(r.subjectId)}</b>
          <span class="dur"><input class="input" type="number" min={1} value={r.dur ?? ''} aria-label={`${nameOf(r.subjectId)}時長（分鐘）`} onInput={(e) => { const v = (e.target as HTMLInputElement).value; patch(i, { dur: v ? Number(v) : undefined }); }} /><span>分</span></span>
          <span class="ops">
            <Button small kind="ghost" onClick={() => move(i, -1)} aria-label="上移">↑</Button>
            <Button small kind="ghost" onClick={() => move(i, 1)} aria-label="下移">↓</Button>
            <Button small kind="ghost" onClick={() => patch(i, { day: d === 1 ? 2 : 1 })}>{d === 1 ? '移到第二天' : '移到第一天'}</Button>
            <Button small kind="danger" onClick={() => save(table.filter((_, j) => j !== i))} aria-label={`刪除${nameOf(r.subjectId)}`}>×</Button>
          </span>
          <span class="sub">
            <label><input type="checkbox" checked={!!r.same} disabled={i === 0} onChange={(e) => patch(i, { same: (e.target as HTMLInputElement).checked })} />與上一科同節</label>
            <label>開始時間（選填）<input class="input" type="time" value={r.time ?? ''} onInput={(e) => patch(i, { time: (e.target as HTMLInputElement).value || undefined })} /></label>
            {r.subjectId === 'chinese' && key.startsWith('gsat') && <Badge>國文：整個一起標</Badge>}
            {r.subjectId === 'en-listen' && key === 'gsat12' && <Badge>英聽固定排第一天最後一節</Badge>}
          </span>
        </div>
      ))}
      {missing.length > 0 && <div class="end"><Seg<string> label="新增一科" value="" onChange={(id) => save([...table, { subjectId: id, day: d }])} options={missing.map((id) => ({ value: id, label: `＋${nameOf(id)}` }))} /></div>}
    </div>
  );
  return (
    <div class="card stack">
      <div><h3>節次與時長</h3><p class="small muted">像學校的模擬考科目表：一天一欄，科目由上往下。<b>最重要的是科目順序</b>：用 ↑↓ 改，也可以移到另一天；新增模擬考時自動帶入這份順序。時長只看考試時間、不管發卷與休息；開始時間每次可能不同，所以選填，也不會印在標籤上。</p></div>
      <div class="row" style="justify-content:space-between">
        <Seg<ScheduleKey> label="考試類型" value={key} onChange={setKey} options={KEYS.map((k) => ({ value: k, label: SCHEDULE_LABEL[k] }))} />
        <Button onClick={reset} disabled={!p.doc.settings.schedules?.[key]}>還原「{SCHEDULE_LABEL[key]}」預設</Button>
      </div>
      <Alert tone="info"><b>節次編號依順序自動算；同節＝同時進行。</b>{NOTE[key]}同一節各科的抽離人數會加總，再和預備教室容量比（預設一節一科，只有勾「與上一科同節」才會用到）。</Alert>
      <div class="tt">{day(1)}{day(2)}</div>
    </div>
  );
}
