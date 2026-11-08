/**
 * ④ 標示與抽離、⑤ 排座與預覽的畫面邏輯（純函式，可單元測試）。
 * 排座本身在 src/core；這裡負責從 Doc 組輸入、判斷擋下原因與過期、存回結果與覆寫。
 */
import type { ClassInfo, Classroom, ExamConfig, ExamEntry, MarkMode, MarkRule, Override, SeatingResult, SingleOverride, Track } from '../data';
import { studentCode } from '../data';
import {
  allocateDetaches,
  applyMarks,
  runSeating,
  seatingVersion,
  suggestMarks,
  validateSeating,
  type MarkSuggestion,
  type RunSeatingInput,
  type DetachResult,
} from '../core';
import type { Doc, Result } from './store';

export type StepNo = 1 | 2 | 3 | 4 | 5 | 6;

/** 擋下排座的原因，附「前往處理」的步驟（DESIGN 10.1） */
export interface Blocker {
  step: StepNo;
  text: string;
}

const filesOf = (doc: Doc, examId: string) => doc.examFiles?.[examId] ?? {};

export const examClasses = (doc: Doc, exam: ExamConfig): ClassInfo[] =>
  doc.settings.classes.filter((c) => c.division === exam.division);

/** 本次勾選的教室，依 classroomIds 順序（D65） */
export function examRooms(doc: Doc, exam: ExamConfig): Classroom[] {
  const byId = new Map(doc.settings.classrooms.map((c) => [c.id, c]));
  return exam.classroomIds.map((id) => byId.get(id)).filter((c): c is Classroom => !!c);
}

export const examEntries = (doc: Doc, exam: ExamConfig): ExamEntry[] => filesOf(doc, exam.id).entries ?? [];
export const examOverrides = (doc: Doc, exam: ExamConfig): Override[] => filesOf(doc, exam.id).overrides ?? [];
export const examResult = (doc: Doc, exam: ExamConfig): SeatingResult | undefined => filesOf(doc, exam.id).result;

/** 會考（國中部）不需要 ④：沒有選考，沒有標示與抽離 */
export const needsMarks = (exam: ExamConfig): boolean => exam.division === 'senior';

export const ruleKey = (track: Track | undefined, subjectId: string): string => `${track ?? ''}/${subjectId}`;

export function markSuggestions(doc: Doc, exam: ExamConfig): MarkSuggestion[] {
  if (!needsMarks(exam)) return [];
  return suggestMarks(examEntries(doc, exam), examClasses(doc, exam), exam.subjects);
}

/**
 * 實際生效的標示規則：使用者選過（locked）的照選；其餘照「標少數」建議（D11）；
 * 接近一半而使用者還沒選的，回在 undecided（D12：程式只提醒，不替使用者決定）。
 */
export function effectiveMarkRules(doc: Doc, exam: ExamConfig): { rules: MarkRule[]; undecided: MarkSuggestion[] } {
  const saved = new Map(exam.markRules.filter((r) => r.locked).map((r) => [ruleKey(r.track, r.subjectId), r]));
  const rules: MarkRule[] = [];
  const undecided: MarkSuggestion[] = [];
  for (const s of markSuggestions(doc, exam)) {
    const r = saved.get(ruleKey(s.track, s.subjectId));
    if (r) rules.push(r);
    else if (s.needsDecision) undecided.push(s);
    else if (s.suggested !== 'none') rules.push({ ...(s.track ? { track: s.track } : {}), subjectId: s.subjectId, mode: s.suggested });
  }
  return { rules, undecided };
}

/** 使用者選定某組某科的標示方式並鎖定（D12）；mode 為 undefined 時解除鎖定、回到建議 */
export function setMarkChoice(exam: ExamConfig, track: Track | undefined, subjectId: string, mode: MarkMode | undefined): MarkRule[] {
  const k = ruleKey(track, subjectId);
  const rest = exam.markRules.filter((r) => ruleKey(r.track, r.subjectId) !== k);
  if (mode === undefined) return rest;
  return [...rest, { ...(track ? { track } : {}), subjectId, mode, locked: true }];
}

export function seatingInputOf(doc: Doc, exam: ExamConfig, now: string): RunSeatingInput {
  return {
    examId: exam.id,
    division: exam.division,
    classes: examClasses(doc, exam),
    classrooms: examRooms(doc, exam),
    entries: examEntries(doc, exam),
    subjects: exam.subjects,
    markRules: effectiveMarkRules(doc, exam).rules,
    overrides: examOverrides(doc, exam),
    now,
  };
}

/** 排座前必須先處理的事（擋下並說明，D25） */
export function seatingBlockers(doc: Doc, exam: ExamConfig): Blocker[] {
  const out: Blocker[] = [];
  const f = filesOf(doc, exam.id);
  if (!f.entries?.length) out.push({ step: 2, text: '② 考試名單還沒有匯入' });
  if ((f.diffs ?? []).some((d) => !d.choice)) out.push({ step: 2, text: '② 名單比對還有沒處理的差異' });
  const rooms = examRooms(doc, exam);
  if (!rooms.some((r) => r.kind === 'class')) out.push({ step: 3, text: '③ 還沒有選班級教室' });
  const n = effectiveMarkRules(doc, exam).undecided.length;
  if (n) out.push({ step: 4, text: `④ 有 ${n} 項標示接近一半，要先選標「不考」或「加考」` });
  return out;
}

/** 過期（D22）：有結果，但名單或設定在排座後改過 */
export function isStale(doc: Doc, exam: ExamConfig): boolean {
  const r = examResult(doc, exam);
  return !!r && r.dataVersion !== seatingVersion(seatingInputOf(doc, exam, r.generatedAt));
}

function withFiles(doc: Doc, examId: string, patch: Partial<NonNullable<Doc['examFiles']>[string]>): Doc {
  const cur = filesOf(doc, examId);
  return { ...doc, examFiles: { ...doc.examFiles, [examId]: { ...cur, ...patch } } };
}

/** 重新排座並存回結果；不合規則就擋下，不存（D25） */
export function reseat(doc: Doc, exam: ExamConfig, now: string): Result<Doc> & { errors?: string[]; warnings?: string[] } {
  const blockers = seatingBlockers(doc, exam);
  if (blockers.length) return { ok: false, error: blockers.map((b) => b.text).join('；'), errors: blockers.map((b) => b.text) };
  const r = runSeating(seatingInputOf(doc, exam, now));
  if (!r.ok) return { ok: false, error: r.errors.join('；'), errors: r.errors };
  return { ok: true, doc: withFiles(doc, exam.id, { result: r.result }), warnings: r.warnings };
}

/** 個別覆寫（D23、D26）：一人一筆，重設會取代 */
export function setOverride(doc: Doc, exam: ExamConfig, o: SingleOverride): Result<Doc> {
  const location = o.location.trim();
  if (!location) return { ok: false, error: '請填地點' };
  const list = examOverrides(doc, exam).filter((x) => x.code !== o.code);
  return { ok: true, doc: withFiles(doc, exam.id, { overrides: [...list, { ...o, location }] }) };
}

export function removeOverride(doc: Doc, exam: ExamConfig, code: string): Doc {
  return withFiles(doc, exam.id, { overrides: examOverrides(doc, exam).filter((x) => x.code !== code) });
}

/** 改了覆寫後：原本有結果就自動重排並再驗證（DESIGN：重排後自動重新套用）；重排不過則保留變更、結果標過期 */
export function afterOverrideChange(next: Doc, exam: ExamConfig, now: string): Doc {
  if (!examResult(next, exam)) return next;
  const r = reseat(next, exam, now);
  return r.ok ? r.doc : next;
}

/** ⑤ 驗證清單：以驗證器重驗存檔的結果，依項目分類顯示（任一項不過就不能匯出） */
export interface Check {
  title: string;
  ok: boolean;
  detail: string;
}

const CHECKS: { title: string; match: RegExp }[] = [
  { title: '每位考生恰好一個座位', match: /沒有座位|兩個座位|不在名單/ },
  { title: '座位存在且不重複', match: /座位不存在|同一座位|未選用/ },
  { title: '同班編號沿座位遞增', match: /遞增/ },
  { title: '同一排不同班不穿插', match: /穿插/ },
  { title: '座位由前往後連續安排，中間不空位', match: /中間有空位/ },
  { title: '理組、文組排進同組別的教室', match: /組別|錯誤種類/ },
];

export function validationChecks(doc: Doc, exam: ExamConfig, result: SeatingResult): Check[] {
  const rooms = examRooms(doc, exam).filter((r) => r.kind === 'class');
  const codes = examEntries(doc, exam).map((e) => studentCode(e.classNo, e.seatNo));
  const errors = validateSeating({
    classrooms: rooms,
    classes: examClasses(doc, exam),
    codes,
    assignments: result.assignments,
    checkTrack: exam.division === 'senior',
  });
  const capacity = rooms.reduce((a, r) => a + r.seatCount, 0);
  const checks: Check[] = [
    {
      title: '座位數不少於考生數',
      ok: capacity >= codes.length,
      detail: `考生 ${codes.length} 人，座位 ${capacity} 個`,
    },
  ];
  for (const c of CHECKS) {
    const hit = errors.filter((e) => c.match.test(e));
    checks.push({ title: c.title, ok: hit.length === 0, detail: hit.length ? hit.slice(0, 3).join('；') + (hit.length > 3 ? `…共 ${hit.length} 項` : '') : '符合' });
  }
  const other = errors.filter((e) => !CHECKS.some((c) => c.match.test(e)));
  if (other.length) checks.push({ title: '其他', ok: false, detail: other.join('；') });
  return checks;
}

/** ④ 抽離預覽：依目前規則即時算（不需先排座） */
export function detachPreview(doc: Doc, exam: ExamConfig): DetachResult {
  const { rules } = effectiveMarkRules(doc, exam);
  const marks = applyMarks(examEntries(doc, exam), examClasses(doc, exam), exam.subjects, rules);
  return allocateDetaches({
    subjects: exam.subjects,
    marks,
    overrides: examOverrides(doc, exam),
    reserveRooms: examRooms(doc, exam).filter((r) => r.kind === 'reserve'),
    classes: examClasses(doc, exam),
  });
}

/** ④ 組別對照表：大考中心組別代碼 → 人數與考科（D15） */
export function groupTable(doc: Doc, exam: ExamConfig): { code: string; count: number; subjectIds: string[] }[] {
  const map = new Map<string, { count: number; subjectIds: string[] }>();
  for (const e of examEntries(doc, exam)) {
    const code = e.groupCode ?? '（未填）';
    const cur = map.get(code) ?? { count: 0, subjectIds: exam.subjects.filter((s) => e.subjectIds.includes(s.id)).map((s) => s.id) };
    cur.count++;
    map.set(code, cur);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, v]) => ({ code, ...v }));
}
