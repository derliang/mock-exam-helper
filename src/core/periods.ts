/**
 * 節次（D92、D94；資料依 docs/exam-schedule.md〈學校模擬考實際節次〉）：純函式。
 * - 內建四份預設節次表（學測第 1、2 次／第 3、4 次、分科、會考），使用者在共用設定「節次與時長」可改；
 *   改過的才存進 Settings.schedules，沒存＝內建預設（舊存檔沒有這個欄位，行為與預設相同，不需遷移）。
 * - 每場考試不另存節次：依考試類型與次別取共用設定的那一份，所以新增考試自動帶入、改了共用設定就跟著變。
 * - 節次編號依順序自動算；samePrev＝與上一科同節（同時進行）。
 * - 學測國文整個一起標：國綜、國寫兩列都指向科目 id「chinese」，一個標示涵蓋兩節（D13、D67 不受影響：
 *   標示與抽離仍以科目為單位；英聽人人都考，不參與標示）。
 * - 考科表裡有、節次表找不到的科目（使用者自訂的科目），自動排在最後，各自一節。
 */
import type { ExamKind, PeriodRow, PeriodTable, ScheduleKey, Settings, Subject } from '../data/types';

const r = (name: string, subjectId: string, minutes: number): PeriodRow => ({ name, subjectId, minutes });

/** 內建預設節次表（時長、順序來源：docs/exam-schedule.md；學測第 2、4 次依第 1、3 次推得） */
const DEFAULTS: Record<ScheduleKey, PeriodTable> = {
  g12: {
    days: [
      [r('英文', 'english', 100), r('自然', 'science', 110), r('國綜', 'chinese', 90), r('英聽', 'en-listen', 50)],
      [r('數學', 'math', 100), r('社會', 'social', 110), r('國寫', 'chinese', 90)],
    ],
  },
  g34: {
    days: [
      [r('英文', 'english', 100), r('自然', 'science', 110), r('國綜', 'chinese', 90), r('數學B', 'math-b', 100)],
      [r('數學A', 'math-a', 100), r('社會', 'social', 110), r('國寫', 'chinese', 90)],
    ],
  },
  ast: {
    days: [
      [r('物理', 'physics', 80), r('化學', 'chemistry', 80), r('數學甲', 'math-jia', 80), r('生物', 'biology', 80)],
      [r('歷史', 'history', 80), r('地理', 'geography', 80), r('數學乙', 'math-yi', 80), r('公民與社會', 'civics', 80)],
    ],
  },
  bcct: {
    days: [
      [r('社會', 'social', 70), r('數學', 'math', 80), r('國文', 'chinese', 70), r('寫作測驗', 'writing', 50)],
      [r('自然', 'science', 70), r('英語閱讀', 'en-read', 60), r('英語聽力', 'en-listen', 25)],
    ],
  },
};

export const SCHEDULE_KEYS: readonly { key: ScheduleKey; label: string }[] = [
  { key: 'g12', label: '學測第 1、2 次' },
  { key: 'g34', label: '學測第 3、4 次' },
  { key: 'ast', label: '分科' },
  { key: 'bcct', label: '會考' },
];

const clone = (t: PeriodTable): PeriodTable => ({ days: t.days.map((d) => d.map((x) => ({ ...x }))) });

/** 內建預設（複本，可以放心改） */
export const defaultSchedule = (key: ScheduleKey): PeriodTable => clone(DEFAULTS[key]);

/** 考試用哪一份節次表：學測第 3 次起（數學分 A、B、無英聽）用第 3、4 次那份 */
export function scheduleKeyOf(kind: ExamKind, round?: number): ScheduleKey {
  if (kind === 'ast') return 'ast';
  if (kind === 'bcct') return 'bcct';
  return (round ?? 1) >= 3 ? 'g34' : 'g12';
}

/** 共用設定裡的節次表；沒改過（含舊存檔）＝內建預設 */
export function scheduleOf(settings: Pick<Settings, 'schedules'>, key: ScheduleKey): PeriodTable {
  const t = settings.schedules?.[key];
  return t && Array.isArray(t.days) ? t : DEFAULTS[key];
}

/** 這份是否與內建預設相同（用來決定要不要存、還原鈕要不要亮） */
export const isDefaultSchedule = (t: PeriodTable, key: ScheduleKey): boolean => JSON.stringify(normalize(t)) === JSON.stringify(normalize(DEFAULTS[key]));

function normalize(t: PeriodTable): unknown {
  return t.days.map((d) => d.map((x) => [x.name, x.subjectId ?? '', x.minutes ?? null, !!x.samePrev, x.start ?? '']));
}

/** 寫回共用設定；與預設相同就拿掉（＝還原預設） */
export function withSchedule<T extends Pick<Settings, 'schedules'>>(settings: T, key: ScheduleKey, table: PeriodTable | undefined): T {
  const rest = { ...(settings.schedules ?? {}) };
  delete rest[key];
  if (table && !isDefaultSchedule(table, key)) rest[key] = table;
  const out = { ...settings, schedules: rest };
  if (!Object.keys(rest).length) delete (out as { schedules?: unknown }).schedules;
  return out;
}

export interface NumberedRow extends PeriodRow {
  day: number;
  index: number;
  /** 第幾節（1 起，整張表累計；同節判斷與抽離容量用） */
  period: number;
  /** 當天的第幾個時段（1 起，每天重新編號；畫面與標籤顯示用） */
  slot: number;
}

const ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const zh = (n: number): string => ZH[n] ?? String(n);
/** 時段名稱：時段一、時段二…（每天各自從時段一開始，使用者 2026-11-10） */
export const slotName = (slot: number): string => `時段${zh(slot)}`;
/** 第一天、第二天…（0 起的天別索引） */
export const dayName = (day: number): string => `第${zh(day + 1)}天`;

/** 依順序編節次：每列一節，勾「與上一科同節」就沿用上一列的節次（可跨天；整張表的第一列不能同節） */
export function numberRows(t: PeriodTable): NumberedRow[] {
  const out: NumberedRow[] = [];
  let p = 0;
  t.days.forEach((day, di) => {
    let slot = 0;
    let lastP = -1;
    day.forEach((row, i) => {
      if (!(row.samePrev && out.length)) p++;
      if (p !== lastP) slot++;
      lastP = p;
      out.push({ ...row, day: di, index: i, period: p, slot });
    });
  });
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, '');

/** 一科在第幾節（可能不只一節，例如學測國文＝國綜＋國寫）；label 是節次表上的名稱，印在預備教室標籤 */
export interface SubjectPeriod {
  period: number;
  label: string;
  /** 天別（0 起）與當天時段（1 起）；沒有節次表的科目為 undefined */
  day?: number;
  slot?: number;
}

/**
 * 考科表每一科對到哪幾節。先用 subjectId 對，再用名稱對；節次表沒有的科目排在最後，各自一節。
 * 節次表有、考科表沒有的列（例如本次沒有英聽）直接略過，但節次編號不變（與共用設定畫面一致）。
 */
export function subjectPeriods(subjects: readonly Subject[], table: PeriodTable): Map<string, SubjectPeriod[]> {
  const rows = numberRows(table);
  const ids = new Set(subjects.map((s) => s.id));
  const byName = new Map(subjects.map((s) => [norm(s.name), s.id]));
  const out = new Map<string, SubjectPeriod[]>();
  for (const row of rows) {
    const id = row.subjectId && ids.has(row.subjectId) ? row.subjectId : byName.get(norm(row.name));
    if (!id) continue;
    const list = out.get(id) ?? [];
    if (!list.some((x) => x.period === row.period)) list.push({ period: row.period, label: row.name, day: row.day, slot: row.slot });
    out.set(id, list);
  }
  let next = rows.reduce((m, x) => Math.max(m, x.period), 0);
  for (const s of subjects) if (!out.has(s.id)) out.set(s.id, [{ period: ++next, label: s.name }]);
  return out;
}

/** 一場考試的科目節次（考試類型＋次別取共用設定的節次表） */
export function examSubjectPeriods(exam: { kind: ExamKind; round?: number; subjects: readonly Subject[] }, settings: Pick<Settings, 'schedules'>): Map<string, SubjectPeriod[]> {
  return subjectPeriods(exam.subjects, scheduleOf(settings, scheduleKeyOf(exam.kind, exam.round)));
}

/** 節次對照是否就是「一科一節、各科不同節」（預設表都是；只有使用者勾了同節才不是）——用來保持舊資料的版本碼不變 */
export function isOneSubjectPerPeriod(map: Map<string, SubjectPeriod[]>): boolean {
  const seen = new Set<number>();
  for (const list of map.values()) for (const x of list) {
    if (seen.has(x.period)) return false;
    seen.add(x.period);
  }
  return true;
}

// ---------- 編輯（共用設定「節次與時長」分頁用；全部回傳新表，不改原表） ----------

export type RowRef = { day: number; index: number };

/** 修改一列 */
export function updateRow(t: PeriodTable, at: RowRef, patch: Partial<PeriodRow>): PeriodTable {
  const c = clone(t);
  const row = c.days[at.day]?.[at.index];
  if (!row) return t;
  Object.assign(row, patch);
  for (const k of Object.keys(patch) as (keyof PeriodRow)[]) if (patch[k] === undefined || patch[k] === '') delete row[k];
  return c;
}

/** 刪除一列 */
export function removeRow(t: PeriodTable, at: RowRef): PeriodTable {
  const c = clone(t);
  c.days[at.day]?.splice(at.index, 1);
  return c;
}

/** 在某一天最後新增一科（時長沿用那天最後一科，沒有就 80 分鐘） */
export function addRow(t: PeriodTable, day: number, name = '新科目'): PeriodTable {
  const c = clone(t);
  while (c.days.length <= day) c.days.push([]);
  const d = c.days[day]!;
  d.push({ name, minutes: d[d.length - 1]?.minutes ?? 80 });
  return c;
}

/** ↑↓：同一天內交換；到頭就移到前一天最後／下一天最前 */
export function moveRow(t: PeriodTable, at: RowRef, dir: -1 | 1): PeriodTable {
  const c = clone(t);
  const arr = c.days[at.day];
  if (!arr || !arr[at.index]) return t;
  const j = at.index + dir;
  if (j >= 0 && j < arr.length) {
    [arr[at.index], arr[j]] = [arr[j]!, arr[at.index]!];
  } else if (j < 0 && at.day > 0) {
    c.days[at.day - 1]!.push(arr.splice(at.index, 1)[0]!);
  } else if (j >= arr.length && at.day < c.days.length - 1) {
    c.days[at.day + 1]!.unshift(arr.splice(at.index, 1)[0]!);
  } else return t;
  return c;
}

/** 拖拉：把 from 移到 to 那一列的位置（to.index 等於那天長度＝放到那天最後） */
export function dropRow(t: PeriodTable, from: RowRef, to: RowRef): PeriodTable {
  if (from.day === to.day && from.index === to.index) return t;
  const c = clone(t);
  const src = c.days[from.day];
  const dst = c.days[to.day];
  if (!src || !dst || !src[from.index]) return t;
  const [row] = src.splice(from.index, 1);
  let idx = to.index;
  if (from.day === to.day && from.index < to.index) idx--;
  dst.splice(Math.max(0, Math.min(idx, dst.length)), 0, row!);
  return c;
}
