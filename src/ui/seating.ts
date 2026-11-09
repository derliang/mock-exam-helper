/**
 * ④ 標示與抽離、⑤ 排座與預覽的畫面邏輯（純函式，可單元測試）。
 * 排座本身在 src/core；這裡負責從 Doc 組輸入、判斷擋下原因與過期、存回結果與覆寫。
 */
import type { ClassInfo, Classroom, ExamConfig, ExamEntry, MarkMode, MarkRule, Override, SeatingResult, SingleOverride, Track } from '../data';
import { classroomSeats, studentCode } from '../data';
import {
  allocateDetaches,
  applyMarks,
  roomStats,
  specialOf,
  runSeating,
  fullyAbsentCodes,
  entryTracks,
  seatingVersion,
  suggestMarks,
  preferMarkAbsent,
  validateSeating,
  type MarkSuggestion,
  type RunSeatingInput,
  type DetachResult,
} from '../core';
import type { Doc, Result } from './store';
import { roomsMissingTrack } from './rooms';

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

/** 是否匯入過本次考試名單（會考不需要匯入，見 examEntries） */
export const hasImportedList = (doc: Doc, exam: ExamConfig): boolean => !!filesOf(doc, exam.id).entries?.length;

/**
 * 本次考試的考生。已匯入考試名單就用名單；
 * 會考（國中部）全員參加、每科都考，沒匯入時學生名單就是考試名單（每人考全部七科），不必匯入（D82 修訂）。
 * 各處（摘要列、③、④、⑤、⑥、排座輸入）都從這裡取考生，口徑只有一個。
 */
export const examEntries = (doc: Doc, exam: ExamConfig): ExamEntry[] => {
  const imported = filesOf(doc, exam.id).entries;
  if (imported?.length || exam.kind !== 'bcct') return imported ?? [];
  const subjectIds = exam.subjects.map((x) => x.id);
  return (doc.rosters[exam.division] ?? []).map((s) => ({
    classNo: s.classNo, seatNo: s.seatNo, name: s.name, subjectIds: [...subjectIds],
    ...(s.special ? { note: s.special } : {}),
  }));
};

/** 實際要排座的考生：預設排除全科缺考者（D79，與 core runSeating 同一份判斷）；設「仍排座」則全部 */
export const seatableEntries = (doc: Doc, exam: ExamConfig): ExamEntry[] => {
  const entries = examEntries(doc, exam);
  const skip = new Set(fullyAbsentCodes({ entries, seatFullyAbsent: !!exam.seatFullyAbsent }));
  return skip.size ? entries.filter((e) => !skip.has(studentCode(e.classNo, e.seatNo))) : entries;
};
export const examOverrides = (doc: Doc, exam: ExamConfig): Override[] => filesOf(doc, exam.id).overrides ?? [];
export const examResult = (doc: Doc, exam: ExamConfig): SeatingResult | undefined => filesOf(doc, exam.id).result;

/** 會考（國中部）不需要 ④：沒有選考，沒有標示與抽離 */
export const needsMarks = (exam: ExamConfig): boolean => exam.division === 'senior';

export const ruleKey = (track: Track | undefined, subjectId: string): string => `${track ?? ''}/${subjectId}`;

export function markSuggestions(doc: Doc, exam: ExamConfig): MarkSuggestion[] {
  if (!needsMarks(exam)) return [];
  const list = suggestMarks(seatableEntries(doc, exam), examClasses(doc, exam), exam.subjects);
  return exam.kind === 'ast' ? preferMarkAbsent(list) : list;
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

/** ④ 各科標示表的一列；state：auto＝照標少數、locked＝使用者選過、undecided＝接近一半待選、none＝全考或全不考，不用標 */
export interface MarkRow {
  track?: Track;
  subjectId: string;
  subjectName: string;
  taking: number;
  notTaking: number;
  mode: MarkMode | undefined;
  state: 'auto' | 'locked' | 'undecided' | 'none';
  nearHalf: boolean;
}

export function markRows(doc: Doc, exam: ExamConfig): MarkRow[] {
  const locked = new Map(exam.markRules.filter((r) => r.locked).map((r) => [ruleKey(r.track, r.subjectId), r]));
  const name = new Map(exam.subjects.map((s) => [s.id, s.name]));
  return markSuggestions(doc, exam).map((s) => {
    const l = locked.get(ruleKey(s.track, s.subjectId));
    const state: MarkRow['state'] = l ? 'locked' : s.needsDecision ? 'undecided' : s.suggested === 'none' ? 'none' : 'auto';
    return {
      ...(s.track ? { track: s.track } : {}), subjectId: s.subjectId, subjectName: name.get(s.subjectId) ?? s.subjectId,
      taking: s.taking, notTaking: s.total - s.taking, mode: l ? l.mode : s.needsDecision ? undefined : s.suggested, state, nearHalf: s.needsDecision,
    };
  });
}

/** 輸出用的姓名：共用學生名單優先，查無才用考試名單（與 export/model 同一規則，⑤預覽、⑥預覽、下載一致） */
export function nameMapOf(doc: Doc, exam: ExamConfig): Map<string, string> {
  const m = new Map(examEntries(doc, exam).map((e) => [studentCode(e.classNo, e.seatNo), e.name]));
  for (const s of doc.rosters[exam.division] ?? []) { const c = studentCode(s.classNo, s.seatNo); if (m.has(c)) m.set(c, s.name); }
  return m;
}

/** 共用名單與考試名單姓名不同的人（會影響輸出文件，納入版本碼，#61） */
export function rosterNameDiffs(doc: Doc, exam: ExamConfig): { code: string; name: string }[] {
  const entry = new Map(examEntries(doc, exam).map((e) => [studentCode(e.classNo, e.seatNo), e.name]));
  const out: { code: string; name: string }[] = [];
  for (const s of doc.rosters[exam.division] ?? []) {
    const c = studentCode(s.classNo, s.seatNo);
    if (entry.has(c) && entry.get(c) !== s.name) out.push({ code: c, name: s.name });
  }
  return out.sort((a, b) => (a.code < b.code ? -1 : 1));
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
    ...(exam.seatFullyAbsent ? { seatFullyAbsent: true } : {}),
    ...(rosterNameDiffs(doc, exam).length ? { rosterNames: rosterNameDiffs(doc, exam) } : {}),
    now,
  };
}

/** 排座前必須先處理的事（擋下並說明，D25） */
export function seatingBlockers(doc: Doc, exam: ExamConfig): Blocker[] {
  const out: Blocker[] = [];
  const f = filesOf(doc, exam.id);
  if (!f.entries?.length && exam.kind !== 'bcct') out.push({ step: 2, text: '② 考試名單還沒有匯入' });
  if ((f.diffs ?? []).some((d) => !d.choice)) out.push({ step: 2, text: '② 名單比對還有沒處理的差異' });
  const rooms = examRooms(doc, exam);
  if (!rooms.some((r) => r.kind === 'class')) out.push({ step: 3, text: '③ 還沒有選班級教室' });
  const noTrack = roomsMissingTrack(rooms, exam.division);
  if (noTrack.length) out.push({ step: 3, text: `③ 班級教室「${noTrack.map((r) => r.name).join('、')}」還沒指定理組／文組` });
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

const CHECKS: { title: string; match: RegExp; track?: true }[] = [
  { title: '每位考生恰好一個座位', match: /沒有座位|兩個座位|不在名單/ },
  { title: '座位存在且不重複', match: /座位不存在|同一座位|未選用/ },
  { title: '同班編號沿座位遞增', match: /遞增/ },
  { title: '同一排不同班不穿插', match: /穿插/ },
  { title: '座位由前往後連續安排，中間不空位', match: /中間有空位/ },
  { title: '理組、文組排進同組別的教室', match: /組別|錯誤種類/, track: true },
];

export function validationChecks(doc: Doc, exam: ExamConfig, result: SeatingResult): Check[] {
  const rooms = examRooms(doc, exam).filter((r) => r.kind === 'class');
  const codes = seatableEntries(doc, exam).map((e) => studentCode(e.classNo, e.seatNo));
  const errors = validateSeating({
    classrooms: rooms,
    classes: examClasses(doc, exam),
    codes,
    assignments: result.assignments,
    checkTrack: exam.division === 'senior',
    ...(entryTracks(seatableEntries(doc, exam)) ? { trackOf: entryTracks(seatableEntries(doc, exam))! } : {}),
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
    if (c.track && exam.division === 'junior') continue; // 會考不分文理組，不顯示這一項
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
  const marks = applyMarks(seatableEntries(doc, exam), examClasses(doc, exam), exam.subjects, rules);
  return allocateDetaches({
    subjects: exam.subjects,
    marks,
    overrides: examOverrides(doc, exam),
    reserveRooms: examRooms(doc, exam).filter((r) => r.kind === 'reserve'),
    classes: examClasses(doc, exam),
  });
}

/* ---------- 座位表（⑤ 預覽） ---------- */

/** 座位表的一格：off＝這間教室沒有這個座位（D72 尾端空位）；free＝有座位但沒排人 */
export type ChartCell =
  | { kind: 'off'; co: string }
  | { kind: 'free'; co: string }
  | {
      kind: 'student'; co: string; code: string; name: string; classNo: number; className: string; colorIndex: number;
      /** 標示文字，例「X社會」「＋自然」「→教務處」 */
      marks: string[];
      markKind?: 'x' | 'add';
    };

export interface ChartModel {
  rows: number;
  depth: number;
  /** 由上到下＝深位大到小（講臺在下方，D50）；每列由左到右＝第 1 排到最後一排 */
  lines: ChartCell[][];
  count: number;
}

function studentCtx(doc: Doc, exam: ExamConfig, result: SeatingResult) {
  const entries = new Map(examEntries(doc, exam).map((e) => [studentCode(e.classNo, e.seatNo), e]));
  const nameOf = nameMapOf(doc, exam);
  const classes = new Map(examClasses(doc, exam).map((c) => [c.no, c]));
  const subjName = new Map(exam.subjects.map((s) => [s.id, s.name]));
  const marksBy = new Map<string, string[]>();
  const absent = new Set<string>();
  for (const m of result.marks) {
    if (m.mode === 'absent') absent.add(m.code);
    marksBy.set(m.code, [...(marksBy.get(m.code) ?? []), `${m.mode === 'absent' ? 'X' : '＋'}${subjName.get(m.subjectId) ?? m.subjectId}`]);
  }
  const over = new Map(result.overrides.map((o) => [o.code, o]));
  return (code: string, co: string): ChartCell => {
    const e = entries.get(code);
    const classNo = e?.classNo ?? Number(code.slice(0, 2));
    const c = classes.get(classNo);
    // 覆寫只改「被標示的那幾科」去哪裡（core/detach）；沒標示的人覆寫不生效，座位表照常
    const own = marksBy.get(code) ?? [];
    const o = own.length ? over.get(code) : undefined;
    const marks = o ? [...own, `→${o.location}`] : own;
    const markKind = marks.length ? (absent.has(code) ? 'x' : 'add') : undefined;
    return {
      kind: 'student', co, code, name: nameOf.get(code) ?? e?.name ?? '（不在名單）', classNo, className: c?.name ?? String(classNo), colorIndex: c?.colorIndex ?? classNo,
      marks, ...(markKind ? { markKind } : {}),
    };
  };
}

function buildChart(room: Classroom, seated: Map<string, string>, cell: (code: string, co: string) => ChartCell): ChartModel {
  const exists = new Set(classroomSeats(room).map((s) => `${s.row}-${s.depth}`));
  const lines: ChartCell[][] = [];
  for (let d = room.depth; d >= 1; d--) {
    const line: ChartCell[] = [];
    for (let r = 1; r <= room.rows; r++) {
      const co = `${r}-${d}`;
      const code = seated.get(co);
      line.push(code ? cell(code, co) : exists.has(co) ? { kind: 'free', co } : { kind: 'off', co });
    }
    lines.push(line);
  }
  return { rows: room.rows, depth: room.depth, lines, count: seated.size };
}

/** 班級教室的座位表 */
export function chartModel(doc: Doc, exam: ExamConfig, result: SeatingResult, room: Classroom): ChartModel {
  const seated = new Map(result.assignments.filter((a) => a.classroomId === room.id).map((a) => [`${a.row}-${a.depth}`, a.code]));
  return buildChart(room, seated, studentCtx(doc, exam, result));
}

/** 預備教室某科抽離考試的座位表（柔和單色，D69⑧）；格內不再印標示，標題就寫科目 */
export function detachChartModel(doc: Doc, exam: ExamConfig, result: SeatingResult, room: Classroom, subjectId: string): ChartModel {
  const seated = new Map(
    result.detaches.filter((d) => d.purpose === 'exam' && d.subjectId === subjectId && d.roomId === room.id && d.seat)
      .map((d) => [`${d.seat!.row}-${d.seat!.depth}`, d.code]),
  );
  const ctx = studentCtx(doc, exam, { ...result, marks: [], overrides: [] });
  return buildChart(room, seated, ctx);
}

/** ⑤ 抽離總覽：每科抽離考試（教室與人數）、抽離自習人數、單人特例人數 */
export function detachSummary(exam: ExamConfig, result: SeatingResult): { subjectId: string; name: string; examRooms: { roomId: string; count: number }[]; study: number; special: number }[] {
  const sp = specialOf(result);
  return exam.subjects.map((s) => {
    const ex = result.detaches.filter((d) => d.subjectId === s.id && d.purpose === 'exam');
    const rooms = [...new Set(ex.map((d) => d.roomId))].map((roomId) => ({ roomId, count: ex.filter((d) => d.roomId === roomId).length }));
    return {
      subjectId: s.id, name: s.name, examRooms: rooms,
      study: result.detaches.filter((d) => d.subjectId === s.id && d.purpose === 'study').length,
      special: sp.filter((x) => x.subjectId === s.id).length,
    };
  }).filter((x) => x.examRooms.length || x.study || x.special);
}

/** ⑤ 座位表統計表（D40）：依這間教室，每班考生人數與每班在本教室考各科的人數 */
export function roomStatTable(doc: Doc, exam: ExamConfig, result: SeatingResult, roomId: string): { classes: { no: number; name: string }[]; rows: { label: string; per: number[]; total: number }[] } {
  const st = roomStats(roomId, result.assignments, examEntries(doc, exam), exam.subjects, result.detaches, specialOf(result));
  const names = new Map(examClasses(doc, exam).map((c) => [c.no, c.name]));
  const classes = st.perClass.map((c) => ({ no: c.classNo, name: names.get(c.classNo) ?? String(c.classNo) }));
  const pick = (l: { classNo: number; count: number }[]) => classes.map((c) => l.find((x) => x.classNo === c.no)?.count ?? 0);
  const subjName = new Map(exam.subjects.map((s) => [s.id, s.name]));
  return {
    classes,
    rows: [
      { label: '本教室考生人數', per: pick(st.perClass), total: st.total },
      ...st.perSubject.map((s) => ({ label: `在本教室考${subjName.get(s.subjectId) ?? s.subjectId}`, per: pick(s.inRoomPerClass), total: s.inRoom })),
    ],
  };
}

/** 個別覆寫的提醒：覆寫的人已不在名單、或這個人沒有任何標示（覆寫不會生效） */
export function overrideNotes(doc: Doc, exam: ExamConfig, result: SeatingResult | undefined): Map<string, string> {
  const codes = new Set(examEntries(doc, exam).map((e) => studentCode(e.classNo, e.seatNo)));
  const marked = new Set((result?.marks ?? []).map((m) => m.code));
  const out = new Map<string, string>();
  for (const o of examOverrides(doc, exam)) {
    if (!codes.has(o.code)) out.set(o.code, '已不在考試名單，請移除');
    else if (result && !marked.has(o.code)) out.set(o.code, '這位考生每科都在原教室考，沒有要抽離的科目，覆寫不會生效');
  }
  return out;
}

/** ④ 組別對照表：大考中心組別代碼 → 人數與考科（D15）；同代碼考科不一致時標出 differing 人數（#70） */
export function groupTable(doc: Doc, exam: ExamConfig): { code: string; count: number; subjectIds: string[]; /** 考科與標準（人數最多的組合）不同的人數；0＝一致 */ differing: number }[] {
  const by = new Map<string, Map<string, { n: number; ids: string[] }>>();
  for (const e of examEntries(doc, exam)) {
    const code = e.groupCode ?? '（未填）';
    const ids = exam.subjects.filter((s) => e.subjectIds.includes(s.id)).map((s) => s.id);
    const combos = by.get(code) ?? new Map<string, { n: number; ids: string[] }>();
    const key = ids.join(',');
    const c = combos.get(key) ?? { n: 0, ids };
    c.n++;
    combos.set(key, c);
    by.set(code, combos);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, combos]) => {
    // 標準＝人數最多的組合；同人數取鍵值小者，結果與資料列順序無關
    const list = [...combos.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1));
    const count = list.reduce((n, [, v]) => n + v.n, 0);
    return { code, count, subjectIds: list[0]![1].ids, differing: count - list[0]![1].n };
  });
}
