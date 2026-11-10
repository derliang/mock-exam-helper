/** 比對前後兩份文件，推出「剛剛做了什麼」給復原按鈕用（純函式；頁面不用各自傳名稱） */
import type { Division, Student } from '../data';
import type { Doc } from './store';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const key = (s: Student): string => `${s.classNo}-${s.seatNo}`;
const DIV: Record<Division, string> = { senior: '高中部', junior: '國中部' };

function rosterLabel(prev: Student[], next: Student[], div: Division): string | undefined {
  if (same(prev, next)) return undefined;
  const p = new Map(prev.map((s) => [key(s), s]));
  const n = new Map(next.map((s) => [key(s), s]));
  const added = next.filter((s) => !p.has(key(s))).length;
  const removed = prev.filter((s) => !n.has(key(s))).length;
  if (added + removed > 3) return `匯入${DIV[div]}學生名單`;
  if (added === 1 && removed === 0) return '新增學生';
  if (removed === 1 && added === 0) return '刪除學生';
  if (added === 0 && removed === 0) return '編輯學生';
  return `修改${DIV[div]}學生名單`;
}

function examLabel(prev: Doc['exams'], next: Doc['exams']): string | undefined {
  if (same(prev, next)) return undefined;
  if (next.length > prev.length) return '新增模擬考';
  if (next.length < prev.length) return '刪除模擬考';
  const i = next.findIndex((e, k) => !same(e, prev[k]));
  const a = prev[i]; const b = next[i];
  if (!a || !b) return '修改模擬考';
  if (a.name !== b.name) return '修改考試名稱';
  if (!same(a.subjects, b.subjects)) return '修改考科表';
  if (a.participation !== b.participation) return '修改參加方式';
  if (!same(a.classroomIds, b.classroomIds)) return '選用教室';
  if (!same(a.markRules, b.markRules)) return '修改個別覆寫';
  if (!same(a.labelLayout, b.labelLayout)) return '修改標籤版面';
  if (a.round !== b.round) return '修改次別';
  return '修改模擬考設定';
}

function settingsLabel(prev: Doc['settings'], next: Doc['settings']): string | undefined {
  if (same(prev, next)) return undefined;
  if (!same(prev.classes, next.classes)) {
    if (next.classes.length > prev.classes.length) return '新增班級';
    if (next.classes.length < prev.classes.length) return '刪除班級';
    const a = prev.classes.find((c, k) => !same(c, next.classes[k]));
    const b = a && next.classes.find((c) => c.no === a.no && c.division === a.division);
    if (a && b && a.colorIndex !== b.colorIndex) return '修改班級色';
    if (a && b && a.track !== b.track) return '修改文理組';
    if (a && b && a.name !== b.name) return '修改班級名稱';
    return '修改班級資料';
  }
  if (!same(prev.classrooms, next.classrooms)) {
    return next.classrooms.length > prev.classrooms.length ? '新增教室' : next.classrooms.length < prev.classrooms.length ? '刪除教室' : '修改教室';
  }
  if (prev.schoolName !== next.schoolName || prev.headerText !== next.headerText || prev.seatHeader !== next.seatHeader || prev.labelHeader !== next.labelHeader || prev.labelNotes !== next.labelNotes || prev.defaultLabelPaper !== next.defaultLabelPaper) return '修改學校與表頭';
  if (!same(prev.features, next.features)) return '切換選用功能';
  return '修改設定';
}

function filesLabel(prev: Doc['examFiles'], next: Doc['examFiles']): string | undefined {
  if (same(prev ?? {}, next ?? {})) return undefined;
  const ids = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  for (const id of ids) {
    const a = prev?.[id] ?? {}; const b = next?.[id] ?? {};
    if (!same(a.result, b.result)) return b.result ? '排座' : '清除排座結果';
    if (!same(a.entries, b.entries)) return '匯入考試名單';
    if (!same(a.diffs, b.diffs)) return '處理名單比對';
    if (!same(a.overrides, b.overrides)) return '修改個別覆寫';
  }
  return '修改考試檔案';
}

/** 同一次變更碰到多處時，以一句話涵蓋；找不到就回 undefined（由呼叫端用預設名稱） */
export function describeChange(prev: Doc, next: Doc): string | undefined {
  const parts: string[] = [];
  for (const div of ['senior', 'junior'] as Division[]) {
    const l = rosterLabel(prev.rosters[div], next.rosters[div], div);
    if (l) parts.push(l);
  }
  const x = examLabel(prev.exams, next.exams); if (x) parts.push(x);
  const s = settingsLabel(prev.settings, next.settings); if (s) parts.push(s);
  const f = filesLabel(prev.examFiles, next.examFiles); if (f) parts.push(f);
  if (parts.length === 0) return undefined;
  // 名單比對套用會同時動學生名單與考試名單：用較能描述整件事的那個
  if (parts.length > 1 && parts.includes('處理名單比對')) return '套用名單比對';
  if (parts.length > 1 && parts.includes('新增班級') && parts[0]?.startsWith('匯入')) return `${parts[0]}並新增班級`;
  return parts[0];
}
