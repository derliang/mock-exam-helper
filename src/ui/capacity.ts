/** 步驟③ 狀態檢核（原型「狀態檢核」卡）：高中部理組／文組各算一次、預備教室容量另算（D6、D69） */
import type { ExamConfig, Track } from '../data';
import { detachPreview, examEntries, seatableEntries, examRooms } from './seating';
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
export function classCapacity(doc: Doc, exam: ExamConfig): { lines: CapacityLine[]; untracked: number; /** 還沒匯入本次考試名單：沒有考生人數可比，不顯示 0（D82） */ noList: boolean } {
  const rooms = examRooms(doc, exam).filter((r) => r.kind === 'class');
  const roster = seatableEntries(doc, exam);
  if (examEntries(doc, exam).length === 0) return { lines: [], untracked: rooms.filter((r) => !r.track).length, noList: true };
  if (exam.division === 'junior') {
    return { lines: [line('全體', rooms.reduce((n, r) => n + r.seatCount, 0), roster.length)], untracked: 0, noList: false };
  }
  const trackOfClass = new Map(doc.settings.classes.filter((c) => c.division === exam.division).map((c) => [c.no, c.track]));
  const lines: CapacityLine[] = [];
  for (const t of ['science', 'liberal'] as Track[]) {
    lines.push(line(TRACK_NAME[t], rooms.filter((r) => r.track === t).reduce((n, r) => n + r.seatCount, 0), roster.filter((s) => trackOfClass.get(s.classNo) === t).length));
  }
  return { lines, untracked: rooms.filter((r) => !r.track).length, noList: false };
}

export type ReserveCheck = { tone: 'ok' | 'warn' | 'info'; message: string };

/** 預備教室容量：沿用抽離分配的結果（不夠會回報是哪一科） */
export function reserveCheck(doc: Doc, exam: ExamConfig): ReserveCheck {
  if (exam.kind === 'bcct') return { tone: 'info', message: '會考沒有抽離，不需要預備教室。' };
  const r = detachPreview(doc, exam);
  if (r.ok) return { tone: 'ok', message: '預備教室容量夠用：每一科的抽離考試與自習都排得下。' };
  return { tone: 'warn', message: `預備教室座位不足：${r.errors[0] ?? ''}。請增加預備教室。` };
}
