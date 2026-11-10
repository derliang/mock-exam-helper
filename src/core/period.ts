/**
 * 節次（D92、D94、校-55）：每科一個節次，同編號＝同一節同時進行。
 * 內建預設節次表依學校科目表（docs/exam-schedule.md）；使用者可在共用設定「節次與時長」改順序。
 * 純函式；不認得的科目排在表尾、各自一節。
 */
import type { ExamKind, ScheduleEntry, Subject } from '../data/types';

export type ScheduleKey = 'gsat12' | 'gsat34' | 'ast' | 'bcct';

export const SCHEDULE_LABEL: Record<ScheduleKey, string> = {
  gsat12: '學測 第 1、2 次', gsat34: '學測 第 3、4 次', ast: '分科測驗', bcct: '會考',
};

export function scheduleKey(kind: ExamKind, round = 1): ScheduleKey {
  if (kind === 'bcct') return 'bcct';
  if (kind === 'ast') return 'ast';
  return round <= 2 ? 'gsat12' : 'gsat34';
}

const e = (day: 1 | 2, ...ids: string[]): ScheduleEntry[] => ids.map((subjectId) => ({ subjectId, day }));

/** 內建預設（一節一科）：英聽第 1、2 次固定第一天最後一節；學測國文整個一起標，所以只列一次 */
export function defaultSchedule(key: ScheduleKey): ScheduleEntry[] {
  switch (key) {
    case 'gsat12': return [...e(1, 'english', 'science', 'chinese', 'en-listen'), ...e(2, 'math', 'social')];
    case 'gsat34': return [...e(1, 'english', 'science', 'chinese', 'math-b'), ...e(2, 'math-a', 'social')];
    case 'ast': return [...e(1, 'physics', 'chemistry', 'math-jia', 'biology'), ...e(2, 'history', 'geography', 'math-yi', 'civics')];
    case 'bcct': return [...e(1, 'social', 'math', 'chinese', 'writing'), ...e(2, 'science', 'en-read', 'en-listen')];
  }
}

/** 科目 id → 節次編號（1 起）。只列這次有的科目；表上沒有的科目接在後面，各自一節 */
export function periodMap(subjects: readonly Pick<Subject, 'id'>[], table: readonly ScheduleEntry[]): Map<string, number> {
  const have = new Set(subjects.map((s) => s.id));
  const out = new Map<string, number>();
  let n = 0;
  for (const row of table) {
    if (!have.has(row.subjectId) || out.has(row.subjectId)) continue;
    if (!(row.same && out.size > 0)) n++;
    out.set(row.subjectId, n);
  }
  for (const s of subjects) if (!out.has(s.id)) out.set(s.id, ++n);
  return out;
}

/** 有任何一節含兩科以上才需要把節次放進排座輸入／版本碼 */
export const hasSharedPeriod = (m: ReadonlyMap<string, number>): boolean => new Set(m.values()).size < m.size;

/** 這次考試實際用的節次表：設定裡改過的，否則內建預設 */
export function examSchedule(settings: { schedules?: Record<string, ScheduleEntry[]> }, exam: { kind: ExamKind; round?: number }): ScheduleEntry[] {
  const key = scheduleKey(exam.kind, exam.round);
  return settings.schedules?.[key] ?? defaultSchedule(key);
}

export function examPeriods(settings: { schedules?: Record<string, ScheduleEntry[]> }, exam: { kind: ExamKind; round?: number; subjects: readonly Pick<Subject, 'id'>[] }): Map<string, number> {
  return periodMap(exam.subjects, examSchedule(settings, exam));
}
