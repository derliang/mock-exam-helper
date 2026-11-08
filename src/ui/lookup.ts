/**
 * 考生查詢的純邏輯（H4、D77②、D79、D80）：輸入學號／座號（含班級）／考生編號／姓名 →
 * 該考生每一科的教室、座位（排－深位）、是否抽離或單人特例。不碰 DOM。
 */
import type { ExamConfig, ExamEntry, SeatingResult } from '../data';
import { seatLabel, studentCode } from '../data';
import { examClasses, examEntries, examOverrides, examRooms } from './seating';
import type { Doc } from './store';

export type RowKind = 'class' | 'detach-exam' | 'detach-study' | 'override-exam' | 'override-study' | 'not-taking';

export interface LookupRow {
  subjectId: string;
  subject: string;
  kind: RowKind;
  /** 教室名稱或自填地點；不考的科目為空 */
  place: string;
  /** 「排－深位」，例 1-2；沒有座位（自習、單人特例、不考）為 undefined */
  seat?: string;
  note: string;
}

export interface LookupHit {
  code: string;
  name: string;
  classNo: number;
  className: string;
  seatNo: number;
  /** 全科缺考（D79）；是否有座位看 absentSeat */
  allAbsent: boolean;
  /** 全科缺考但設定「仍排座」時，排座結果給的教室與座位（排－深位）；沒排座則為 undefined */
  absentSeat?: { place: string; seat: string };
  rows: LookupRow[];
}

export type SearchOutcome =
  | { kind: 'empty' }
  | { kind: 'none'; hint: string }
  | { kind: 'found'; entries: ExamEntry[] };

const SEP = /^(\d{1,2})\s*[-－—,，/.、\s]\s*(\d{1,2})$/;

/** 把輸入分類並找出符合的考生；多筆同名或同座號會全部列出供選 */
export function searchExaminees(doc: Doc, exam: ExamConfig, raw: string): SearchOutcome {
  const q = raw.trim();
  if (!q) return { kind: 'empty' };
  const entries = examEntries(doc, exam);
  const classes = examClasses(doc, exam);
  const byCode = (c: number, s: number) => entries.filter((e) => e.classNo === c && e.seatNo === s);
  let found: ExamEntry[] = [];
  let hint = '';

  const sep = SEP.exec(q);
  const named = /^([^\d\s\-－—]+)\s*[-－—]?\s*(\d{1,2})$/.exec(q);
  if (/^\d+$/.test(q)) {
    if (q.length === 4) found = byCode(Number(q.slice(0, 2)), Number(q.slice(2)));
    else if (q.length === 3) found = byCode(Number(q.slice(0, 1)), Number(q.slice(1)));
    else if (q.length <= 2) found = entries.filter((e) => e.seatNo === Number(q)); // 只有座號：各班同座號都列出
    else {
      // 較長的數字當學號（學生名單的 schoolId）
      const roster = doc.rosters[exam.division].filter((s) => s.schoolId === q);
      found = roster.flatMap((s) => byCode(s.classNo, s.seatNo));
    }
    hint = '請確認考生編號是 4 碼（班級 2 碼＋座號 2 碼，例如 0305）、或「班級 座號」（例如 3 5）；學號要與設定頁學生名單一致。';
  } else if (sep) {
    found = byCode(Number(sep[1]), Number(sep[2]));
    hint = '請確認班級與座號有沒有打對。';
  } else if (named && classes.some((c) => c.name === named[1])) {
    const c = classes.find((x) => x.name === named[1])!;
    found = byCode(c.no, Number(named[2]));
    hint = '請確認班級名稱與座號有沒有打對。';
  } else {
    found = entries.filter((e) => e.name.includes(q));
    hint = '姓名可以只打一部分。';
  }
  if (found.length === 0) {
    const empty = entries.length === 0 ? '這次考試還沒有匯入考試名單。' : `在這次考試的 ${entries.length} 位考生中找不到「${q}」。`;
    return { kind: 'none', hint: `${empty}可能原因：他不在這次考試名單（未報名或已除名）、輸入有誤，或名單還沒更新。${hint}` };
  }
  return { kind: 'found', entries: found };
}

/** 某位考生每一科的去處；purpose 以個別覆寫為準（D80） */
export function lookupExaminee(doc: Doc, exam: ExamConfig, result: SeatingResult, e: ExamEntry): LookupHit {
  const code = studentCode(e.classNo, e.seatNo);
  const rooms = examRooms(doc, exam);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
  const className = examClasses(doc, exam).find((c) => c.no === e.classNo)?.name ?? String(e.classNo);
  const base = { code, name: e.name, classNo: e.classNo, className, seatNo: e.seatNo };
  if (e.subjectIds.length === 0) {
    const seated = result.assignments.find((a) => a.code === code);
    return { ...base, allAbsent: true, ...(seated ? { absentSeat: { place: roomName(seated.classroomId), seat: seatLabel(seated) } } : {}), rows: [] };
  }
  const home = result.assignments.find((a) => a.code === code);
  const ov = examOverrides(doc, exam).find((o) => o.code === code);
  const rows: LookupRow[] = exam.subjects.map((s) => {
    const det = result.detaches.find((d) => d.code === code && d.subjectId === s.id);
    const row = { subjectId: s.id, subject: s.name };
    // 單人特例：座位保留、不佔預備教室，所以結果裡沒有抽離紀錄，改看標示（D80）
    const marked = result.marks.some((m) => m.code === code && m.subjectId === s.id);
    if (ov && (det || marked)) {
      const exam_ = ov.purpose === 'exam';
      return { ...row, kind: exam_ ? 'override-exam' : 'override-study', place: ov.location, note: `單人特例：${exam_ ? '在這個地點考試' : '在這個地點自習'}（手動設定）` } as LookupRow;
    }
    if (det) {
      const seat = det.purpose === 'exam' && det.seat ? seatLabel(det.seat) : undefined;
      return {
        ...row, kind: det.purpose === 'exam' ? 'detach-exam' : 'detach-study', place: roomName(det.roomId), seat,
        note: det.purpose === 'exam' ? '抽離考試（到預備教室考）' : '抽離自習（不考這科，到這間自習）',
      } as LookupRow;
    }
    if (!e.subjectIds.includes(s.id)) return { ...row, kind: 'not-taking', place: '', note: '這科不考' } as LookupRow;
    return {
      ...row, kind: 'class', place: home ? roomName(home.classroomId) : '（尚無座位）', seat: home ? seatLabel(home) : undefined,
      note: '在班級教室考',
    } as LookupRow;
  });
  return { ...base, allAbsent: false, rows };
}

export const hitLabel = (e: ExamEntry, doc: Doc, exam: ExamConfig): string => {
  const cn = examClasses(doc, exam).find((c) => c.no === e.classNo)?.name ?? e.classNo;
  return `${cn}班 ${e.seatNo} 號　${studentCode(e.classNo, e.seatNo)}　${e.name}`;
};
