/** 步驟③ 狀態檢核（原型「狀態檢核」卡）：高中部理組／文組各算一次、預備教室容量另算（D6、D69） */
import type { ExamConfig, Track } from '../data';
import { applyMarks } from '../core';
import { periodGroups } from '../core/detach';
import { examSubjectPeriods } from '../core/periods';
import { roomsOfDivision } from './rooms';
import { detachPreview, effectiveMarkRules, examClasses, examEntries, examOverrides, examRooms, seatableEntries } from './seating';
import type { Doc } from './store';

export interface CapacityLine { label: string; seats: number; students: number; ok: boolean; /** 通過時標籤之後的說明 */ detail: string; message: string }

export const TRACK_NAME: Record<Track, string> = { science: '理組', liberal: '文組' };

const line = (label: string, seats: number, students: number): CapacityLine => {
  const ok = seats >= students;
  const extra = seats - students;
  const detail = `教室座位 ${seats}，考生 ${students}${extra > 0 ? `，多 ${extra} 個空位，空位留在最後面（由前往後連續排，中間不空位）。` : '，剛好排滿。'}`;
  const message = ok
    ? `${label}：${detail}`
    : `無法排座：${label}教室座位 ${seats}，考生 ${students}。座位不能比考生少，請增加 ${students - seats} 個座位。`;
  return { label, seats, students, ok, detail, message };
};

/** 班級教室的容量檢核：國中部合計一條；高中部理組、文組各一條，沒指定組別的教室另計 */
export function classCapacity(doc: Doc, exam: ExamConfig): { lines: CapacityLine[]; untracked: number; /** 還沒匯入本次考試名單：沒有考生人數可比，不顯示 0（D82） */ noList: boolean; /** 班級教室座位合計（沒名單也算得出來） */ seats: number } {
  const rooms = examRooms(doc, exam).filter((r) => r.kind === 'class');
  const roster = seatableEntries(doc, exam);
  const seats = rooms.reduce((n, r) => n + r.seatCount, 0);
  if (examEntries(doc, exam).length === 0) return { lines: [], untracked: rooms.filter((r) => !r.track).length, noList: true, seats };
  if (exam.division === 'junior') {
    return { lines: [line('全體', seats, roster.length)], untracked: 0, noList: false, seats };
  }
  const trackOfClass = new Map(doc.settings.classes.filter((c) => c.division === exam.division).map((c) => [c.no, c.track]));
  const lines: CapacityLine[] = [];
  for (const t of ['science', 'liberal'] as Track[]) {
    lines.push(line(TRACK_NAME[t], rooms.filter((r) => r.track === t).reduce((n, r) => n + r.seatCount, 0), roster.filter((s) => (s.track ?? trackOfClass.get(s.classNo)) === t).length));
  }
  return { lines, untracked: rooms.filter((r) => !r.track).length, noList: false, seats };
}

export type ReserveCheck = { tone: 'ok' | 'warn' | 'info'; message: string };

/** 預備教室容量：沿用抽離分配的結果（不夠會回報是哪一科） */
export function reserveCheck(doc: Doc, exam: ExamConfig): ReserveCheck {
  if (exam.kind === 'bcct') return { tone: 'info', message: '會考沒有抽離，不需要預備教室。' };
  const r = detachPreview(doc, exam);
  if (r.ok) return { tone: 'ok', message: '預備教室容量夠用（同一節各科的抽離人數加總再比容量）：每一節的抽離考試與自習都排得下。' };
  return { tone: 'warn', message: `預備教室座位不足：${r.errors[0] ?? ''}。請增加預備教室。` };
}

export interface ReserveNeed {
  /** 需要的座位：同一時段（一組同時進行的節次）抽離考試加抽離自習的人數，取最多的一組 */
  need: number;
  /** 最多的那一組：科目名稱、抽離考試人數、抽離自習人數 */
  who: string; exam: number; study: number;
  /** 已列為預備的教室座位合計、已列入間數、教室總間數 */
  avail: number; on: number; total: number;
}

/** 步驟③ 預備教室格（稿 H-4）：需要／已列入。有手動覆寫（單人特例）的人不進預備教室，不計入 */
export function reserveNeed(doc: Doc, exam: ExamConfig): ReserveNeed {
  const used = examRooms(doc, exam).filter((r) => r.kind === 'reserve');
  const out: ReserveNeed = { need: 0, who: '', exam: 0, study: 0, avail: used.reduce((n, r) => n + r.seatCount, 0), on: used.length, total: roomsOfDivision(doc.settings.classrooms, exam.division, { classes: doc.settings.classes, exams: doc.exams }).filter((r) => r.kind === 'reserve').length };
  if (exam.kind === 'bcct') return out;
  const { rules } = effectiveMarkRules(doc, exam);
  const marks = applyMarks(seatableEntries(doc, exam), examClasses(doc, exam), exam.subjects, rules);
  const overrides = new Map(examOverrides(doc, exam).map((o) => [o.code, o]));
  const name = new Map(exam.subjects.map((s) => [s.id, s.name]));
  for (const g of periodGroups(exam.subjects, examSubjectPeriods(exam, doc.settings))) {
    const ex = new Set<string>(); const st = new Set<string>();
    for (const m of marks) {
      if (!g.subjectIds.includes(m.subjectId)) continue;
      const o = overrides.get(m.code);
      if (o) continue;
      (m.mode === 'extra' ? ex : st).add(m.code);
    }
    const n = new Set([...ex, ...st]).size;
    if (n > out.need) Object.assign(out, { need: n, who: g.subjectIds.map((id) => name.get(id) ?? id).join('、'), exam: ex.size, study: st.size });
  }
  return out;
}
