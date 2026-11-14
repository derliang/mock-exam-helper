/** ② 考試名單的純邏輯：匯入結果 → 該次考試的考試名單；從活頁簿挑出最像名單的工作表 */
import type { ExamConfig, ExamEntry, RosterDiff, Student } from '../data';
import { parseExamList, parseRoster, type ExamListResult, type RosterResult, type Sheet } from '../import';

/** 解析器的科目代碼 → 考科表的科目 id（見 subjects.ts） */
export const SUBJECT_ID_MAP: Record<string, string> = {
  chi: 'chinese', eng: 'english', math: 'math', mathA: 'math-a', mathB: 'math-b', sci: 'science', soc: 'social',
};

export interface ExamImport extends ExamListResult {
  /** 有幾位學生因科目不在本次考科表而被略過科目 */
  droppedSubjects: number;
}

export function parseExamWorkbook(sheets: readonly Sheet[], exam: ExamConfig, classNames: readonly string[]): ExamImport {
  const bcct = exam.kind === 'bcct';
  let best: ExamListResult | null = null;
  for (const s of sheets) {
    const r = parseExamList(s.rows, { round: exam.round, classNames, ...(bcct ? { defaultSubjectIds: exam.subjects.map((x) => x.id) } : {}) });
    if (!best || r.entries.length > best.entries.length) best = r;
  }
  const res = best ?? { entries: [], issues: [{ row: 0, message: '檔案裡沒有工作表' }], columns: {}, headers: {} };
  const ids = new Set(exam.subjects.map((x) => x.id));
  let dropped = 0;
  const entries: ExamEntry[] = res.entries.map((e) => {
    const mapped = e.subjectIds.map((x) => (bcct ? x : (SUBJECT_ID_MAP[x] ?? x)));
    const kept = mapped.filter((x) => ids.has(x));
    if (kept.length !== mapped.length) dropped++;
    return { ...e, subjectIds: kept };
  });
  return { ...res, entries, droppedSubjects: dropped };
}

/** 學生名單：多張工作表時取人數最多者 */
export function parseRosterWorkbook(sheets: readonly Sheet[], classNames: readonly string[]): RosterResult {
  let best: RosterResult | null = null;
  for (const s of sheets) {
    const r = parseRoster(s.rows, { classNames });
    if (!best || r.students.length > best.students.length) best = r;
  }
  return best ?? { students: [], issues: [{ row: 0, message: '檔案裡沒有工作表' }], layout: 'unknown' };
}

export const FIELD_LABEL: Record<string, string> = {
  classNo: '班級', seatNo: '座號', name: '姓名', group: '組別', schoolId: '學號', note: '特殊生需求註明', extra: '加考', school: '校代碼', grade: '年級',
};

export const rosterOf = (students: readonly Student[]): number => students.length;

// ───── Q5（Issue #185）：名單比對「以…為準」套用前預告 ─────

const whoText = (x?: { classNo: number; seatNo: number; name: string }): string =>
  x ? `${String(x.classNo).padStart(2, '0')} 班 ${x.seatNo} 號「${x.name}」` : '這位';

/**
 * 選了「以考試名單為準／以學生名單為準」之後，套用時兩份名單各會怎樣（對照 `applyDiffs`）。
 * 回傳一句白話預告；沒有對應（手動編輯、新增班級類）回 undefined。
 * 已知限制：以學生名單為準時，考試名單裡這位的考科與 X／＋ 標示會被丟掉（只有姓名等不同時才保留）。
 */
export function previewChoice(d: RosterDiff, choice: 'use-exam' | 'use-roster'): string | undefined {
  if (d.kind === 'new-class') return undefined;
  if (d.kind === 'only-in-exam') {
    return choice === 'use-exam'
      ? `學生名單會新增 ${whoText(d.exam)}；考試名單不變。`
      : `考試名單會移除 ${whoText(d.exam)}（連同他的考科與 X／＋ 標示），他不排座；學生名單不變。`;
  }
  if (d.kind === 'only-in-roster') {
    return choice === 'use-exam'
      ? `學生名單會移除 ${whoText(d.roster)}；考試名單不變。`
      : `考試名單會補上 ${whoText(d.roster)}，但沒有任何考科（要之後另行設定）；學生名單不變。`;
  }
  if (d.kind === 'group-diff') {
    return choice === 'use-exam'
      ? `學生名單的組別會改成考試名單的「${d.groups?.exam ?? ''}」；考試名單不變。`
      : `考試名單的組別會改成學生名單的「${d.groups?.roster ?? ''}」，查得到該組別的考科時一併重設這位的考科，原本的 X／＋ 標示會丟掉。`;
  }
  return choice === 'use-exam'
    ? `學生名單會改成考試名單的寫法（${whoText(d.exam)}）；考試名單不變。`
    : `考試名單會改成學生名單的寫法（${whoText(d.roster)}），考科維持；學生名單不變。`;
}
